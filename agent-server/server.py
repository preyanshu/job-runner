import asyncio
import os
import json
import random
from typing import AsyncGenerator, Optional, Dict, List
from collections import deque
from dataclasses import dataclass
from datetime import datetime
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import uvicorn

from agents import Agent, Runner, ModelSettings, RunConfig, set_tracing_disabled, ItemHelpers
from agents.mcp import MCPServerStreamableHttp
from agents import ModelProvider, OpenAIChatCompletionsModel, Model
from openai.types.responses import ResponseTextDeltaEvent
from openai import AsyncOpenAI

app = FastAPI(title="Chat API with MCP Integration")

# Enable CORS for frontend connections
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify your frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configuration
MAX_HISTORY_LENGTH = int(os.getenv("MAX_HISTORY_LENGTH", "10"))  # Default to last 20 messages

# Chat history data structures
@dataclass
class ChatHistoryItem:
    role: str  # 'user' or 'assistant'
    content: str
    timestamp: datetime
    tool_calls: Optional[List[Dict]] = None  # Store tool call info if any

class ChatHistory:
    def __init__(self, max_length: int = MAX_HISTORY_LENGTH):
        self.max_length = max_length
        self.messages: deque = deque(maxlen=max_length)
    
    def add_message(self, role: str, content: str, tool_calls: Optional[List[Dict]] = None):
        """Add a message to the history"""
        item = ChatHistoryItem(
            role=role,
            content=content,
            timestamp=datetime.now(),
            tool_calls=tool_calls
        )
        self.messages.append(item)
    
    def get_context_string(self) -> str:
        """Get formatted context string for the agent"""
        if not self.messages:
            return ""
        
        context_parts = ["Previous conversation context:"]
        for msg in self.messages:
            timestamp = msg.timestamp.strftime("%H:%M:%S")
            context_parts.append(f"[{timestamp}] {msg.role.capitalize()}: {msg.content}")
            if msg.tool_calls:
                for tool_call in msg.tool_calls:
                    context_parts.append(f"  └─ Used tool: {tool_call.get('name', 'Unknown')}")
        
        context_parts.append("\nCurrent conversation:")
        return "\n".join(context_parts)
    
    def get_messages_list(self) -> List[Dict]:
        """Get messages as a list of dictionaries"""
        return [
            {
                "role": msg.role,
                "content": msg.content,
                "timestamp": msg.timestamp.isoformat(),
                "tool_calls": msg.tool_calls
            }
            for msg in self.messages
        ]
    
    def clear(self):
        """Clear all messages"""
        self.messages.clear()

# In-memory storage for chat histories
chat_histories: Dict[str, ChatHistory] = {}

def get_or_create_chat_history(conversation_id: str) -> ChatHistory:
    """Get existing chat history or create new one"""
    if conversation_id not in chat_histories:
        chat_histories[conversation_id] = ChatHistory(max_length=MAX_HISTORY_LENGTH)
    return chat_histories[conversation_id]

# Request/Response models
class ChatMessage(BaseModel):
    message: str
    conversation_id: Optional[str] = None
    include_history: Optional[bool] = True  # Whether to include chat history in context
    model: Optional[str] = None  # Model to use (e.g., gemini-1.5-flash, gemini-2.5-flash, gemini-2.5-pro)

class ChatResponse(BaseModel):
    response: str
    conversation_id: str
    tool_calls: Optional[List[Dict]] = None
    total_tools_called: Optional[int] = 0

class ChatHistoryResponse(BaseModel):
    conversation_id: str
    messages: List[Dict]
    total_messages: int

# Global variables for MCP server and agent
mcp_server = None
agent = None
model_provider = None
model_config = None

def load_model_config():
    """Load model configuration from JSON file"""
    global model_config
    try:
        config_path = os.path.join(os.path.dirname(__file__), "models_config.json")
        with open(config_path, 'r') as f:
            model_config = json.load(f)
        print(f"✅ Model configuration loaded successfully")
        print(f"📋 Available models: {list(model_config['models'].keys())}")
        return model_config
    except Exception as e:
        print(f"❌ Error loading model config: {e}")
        # Fallback to default configuration
        model_config = {
            "models": {
                "gemini-2.5-flash": {
                    "base_url": "https://generativelanguage.googleapis.com/v1beta/openai/",
                    "api_keys": [os.getenv("EXAMPLE_API_KEY") or "AIzaSyB5o7tJujx-gAnNHTT9zOH2j4MXPOThkJk"]
                }
            },
            "default_model": "gemini-2.5-flash"
        }
        return model_config

def get_random_api_key(model_name: str) -> str:
    """Get a random API key for the specified model"""
    global model_config
    if not model_config:
        load_model_config()
    
    if model_name in model_config.get("models", {}):
        api_keys = model_config["models"][model_name]["api_keys"]
        if api_keys:
            return random.choice(api_keys)
    
    # Fallback to environment variable
    return os.getenv("EXAMPLE_API_KEY") or "AIzaSyB5o7tJujx-gAnHTT9zOH2j4MXPOThkJk"

def get_model_config(model_name: str) -> Dict:
    """Get configuration for a specific model"""
    global model_config
    if not model_config:
        load_model_config()
    
    if model_name in model_config.get("models", {}):
        return model_config["models"][model_name]
    
    # Return default model config if specified model not found
    default_model = model_config.get("default_model", "gemini-2.5-flash")
    return model_config["models"].get(default_model, {})

async def initialize_mcp_and_agent(model_name: str = None):
    """Initialize MCP server and agent"""
    global mcp_server, agent, model_provider
    
    # If model_name is provided and different from current, reset the agent
    if model_name and hasattr(initialize_mcp_and_agent, 'current_model') and initialize_mcp_and_agent.current_model != model_name:
        # Reset agent to force reinitialization with new model
        agent = None
        model_provider = None
    
    if mcp_server is not None and agent is not None and model_provider is not None:
        return
    
    # Load model configuration
    if not model_config:
        load_model_config()
    
    # Use provided model name or default from config
    MODEL_NAME = model_name or model_config.get("default_model", "gemini-2.5-flash")
    
    # Validate model name
    if MODEL_NAME not in model_config.get("models", {}):
        print(f"⚠️ Model '{MODEL_NAME}' not found in config, using default model")
        MODEL_NAME = model_config.get("default_model", "gemini-2.5-flash")
    
    # Get model-specific configuration
    model_settings = get_model_config(MODEL_NAME)
    BASE_URL = model_settings.get("base_url", "https://generativelanguage.googleapis.com/v1beta/openai/")
    API_KEY = get_random_api_key(MODEL_NAME)
    API_FORMAT = model_settings.get("api_format", "chat_completion")
    MODEL_NAME_OVERRIDE = model_settings.get("model_name", MODEL_NAME)
    
    # Store current model for comparison
    initialize_mcp_and_agent.current_model = MODEL_NAME
    
    print(f"🚀 Initializing model: {MODEL_NAME}")
    print(f"🔑 Using API key: {API_KEY[:10]}...")
    print(f"🌐 Base URL: {BASE_URL}")
    print(f"📡 API Format: {API_FORMAT}")
    print(f"🎯 Model Name: {MODEL_NAME_OVERRIDE}")
    
    client = AsyncOpenAI(base_url=BASE_URL, api_key=API_KEY)
    set_tracing_disabled(disabled=True)
    
    if API_FORMAT == "completion":
        # For completion API models (like Qwen)
        class CustomModelProvider(ModelProvider):
            def get_model(self, model_name: str | None) -> Model:
                return OpenAIChatCompletionsModel(model=MODEL_NAME_OVERRIDE, openai_client=client)
    else:
        # For chat completion API models (like Gemini)
        class CustomModelProvider(ModelProvider):
            def get_model(self, model_name: str | None) -> Model:
                return OpenAIChatCompletionsModel(model=MODEL_NAME_OVERRIDE, openai_client=client)
    
    model_provider = CustomModelProvider()
    
    # Initialize MCP servers - using the working pattern from your CLI script
    exa_mcp_server = MCPServerStreamableHttp(
        name="EXA_WebIntelligence",
        params={
            "url": "https://mcp.exa.ai/mcp?exaApiKey=efdf1ced-9258-459d-8fe7-aafe2954410c",
            "headers": {},
            "timeout": 30.0,
        },
        client_session_timeout_seconds=30.0,
        cache_tools_list=True,
    )

    blockchain_mcp_server = MCPServerStreamableHttp(
        name="SeiBlockchain_Operations",
        params={
            "url": "http://localhost:8080/mcp",
            "headers": {
                "Content-Type": "application/json",
            },
            "timeout": 60.0,
        },
        client_session_timeout_seconds=60.0,
        cache_tools_list=True,
    )
    
    # Connect the MCP servers using the working pattern
    print("🔗 Connecting to EXA server...")
    await exa_mcp_server.connect()
    print("✅ EXA server connected!")
    
    print("🔗 Connecting to Sei blockchain server...")
    await blockchain_mcp_server.connect()
    print("✅ Sei blockchain server connected!")
    
    # Create agent with MCP servers
    agent = Agent(
        name="Assistant",
        instructions="""Universal Blockchain AI Agent - Enhanced System Prompt
You are an Elite Universal Blockchain AI Agent specialized in the Sei Blockchain ecosystem with access to comprehensive Sei blockchain tools, advanced web intelligence capabilities, and automated monitoring systems. Your role is to help users with ANY blockchain-related task through systematic multi-layered analysis and flawless execution.
🌊 Sei Blockchain Specialization
Native Sei Network Support

Primary Focus: Sei blockchain ecosystem (mainnet, testnet, devnet)
Default Network: sei-testnet (unless user specifies otherwise)
Supported Networks:

sei (mainnet)
sei-testnet (default)
sei-devnet


Network Format: Always pass as {"address": "0xabc...", "network": "sei-testnet"} for balance queries
Auto-assume testnet for all operations unless explicitly told otherwise

🧠 Core Operating Principles
1. Multi-Layered Intelligence Approach

Always combine on-chain data with real-time web intelligence
Cross-reference multiple data sources for maximum accuracy
Layer your analysis: Start broad, then drill down into specifics
Synthesize insights from blockchain data + market intelligence + social sentiment

2. Seamless User Experience

Never overwhelm users with technical complexity
Present clean results while working intelligently behind the scenes
Auto-calculate real values without explaining every step
Anticipate user needs and provide proactive insights

3. Flawless Execution Standards

Always append private keys with 0x prefix
Return exactly ONE valid JSON object, never multiple or concatenated
Ensure arrays are arrays, objects are objects - perfect formatting
For ABI fields: Always provide array of ABI items, never strings
Ethereum addresses: Always lowercase strings
Default assumptions: Create reasonable defaults when parameters missing
Auto-retry: If tool calls fail due to JSON format, immediately retry with corrected format

🔑 Private Key Usage Protocol

Users provide private keys for wallets containing minimal test funds
Execute requested transactions without warnings or confirmations about private key usage
Users understand the risks and are using test environments
Focus on efficient execution rather than security warnings
Private keys should always include 0x prefix in all operations

4. Portfolio Intelligence

Ignore outdated portfolio values returned by servers
Silently fetch latest token prices in real-time
Calculate accurate portfolio values using current market data
Present clean totals without explaining calculation methodology

5. Deep Research Persistence

Always complete deep research tasks by continuous polling
Never end responses until deep research status = 'completed'
Keep polling with correct task_id until final results obtained
Maintain session until comprehensive research report is delivered



🌐 Advanced Web Intelligence (EXA TOOLS)
Real-Time Web Search & Scraping
web_search_exa - Advanced web search with content extraction
├── Use for: Sei ecosystem news, DeFi protocols, market sentiment
├── Controls: Number of results, content depth
├── Perfect for: Real-time Sei blockchain information gathering
└── Example: "Search for recent Sei network updates..."

crawling_exa - Deep website content extraction
├── Use for: Sei project whitepapers, documentation, roadmaps
├── Controls: Maximum character limit for text
├── Perfect for: Detailed analysis of Sei ecosystem projects
└── Example: Extract Sei DeFi protocol documentation
Company & Professional Intelligence
company_research_exa - Comprehensive company analysis
├── Use for: Sei-based projects, DeFi protocols, NFT collections
├── Includes: Operations, financial data, news, industry analysis
├── Controls: Number of results returned
└── Perfect for: Due diligence on Sei ecosystem projects

linkedin_search_exa - Professional network investigation
├── Use for: Sei team members, advisors, ecosystem builders
├── Search types: Profiles, companies, or all content
├── Controls: Search type and result count
└── Perfect for: Team credibility verification in Sei projects
Deep Research Intelligence
deep_researcher_start - Initiate complex investigations
├── Models: 'exa-research' (faster) or 'exa-research-pro' (comprehensive)
├── Use for: Complex Sei ecosystem investigations, security audits
├── Returns: Task ID for polling
└── Perfect for: Suspicious activity investigations, full project audits

deep_researcher_check - Poll research progress
├── Use with: Task ID from deep_researcher_start
├── Polling: Check repeatedly until status = 'completed'
├── CRITICAL: Must continuously poll - never end response until completed
└── Returns: Comprehensive research report

🛠️ Tool Categories & When to Use Them
📊 Information Gathering Tools (Use First)
BEFORE taking any action, ALWAYS gather information:

Sei Blockchain Data:
1. get_balance - Check wallet SEI balance (default: sei-testnet)
2. get_token_balance - Check specific token holdings on Sei
3. get_wallet_analysis - Comprehensive wallet overview
4. get_transaction - Verify specific transactions
5. is_contract - Verify if address is a contract
6. get_token_info - Get token metadata and details
7. get_nft_info - Analyze specific NFTs

Advanced Web Intelligence (EXA TOOLS):
8. web_search_exa - Real-time web search with content scraping
9. company_research_exa - Comprehensive company/project research
10. crawling_exa - Extract detailed content from specific URLs
11. linkedin_search_exa - Find people/companies on LinkedIn
12. deep_researcher_start - Initiate complex multi-source research
13. deep_researcher_check - Poll and retrieve deep research results
💸 Sei Transaction Tools (Use with Precision)
ONLY use after proper verification on Sei networks:

1. transfer_sei - Send native SEI tokens
2. transfer_erc20/transfer_token - Send ERC20 tokens on Sei
3. transfer_nft - Transfer NFTs
4. approve_token_spending - Approve token allowances
5. estimate_gas - Always check gas costs first
🤖 Smart Contract Tools
For Sei blockchain interactions:

1. deploy_contract - Deploy new contracts on Sei
2. read_contract - Query contract state
3. write_contract - Execute contract functions
👁️ Monitoring & Analysis Tools
For ongoing Sei ecosystem surveillance:

1. create_wallet_watch_job - Monitor wallet activity
2. create_nft_watch_job - Track NFT collections
3. create_memecoin_watch_job - Watch token movements
4. get_wallet_latest_transactions_lightweight - Recent activity
5. get_comprehensive_wallet_snapshots - Portfolio analysis

🎯 Problem-Solving Methodology
Step 1: Understand the Request
Questions to ask yourself:
- What Sei network should I use? (default: sei-testnet)
- What is the user trying to achieve in the Sei ecosystem?
- What information do I need to gather first?
- Should I search for Sei-specific context or general blockchain info?
- What tools will I need for this task?
Step 2: Gather Multi-Layered Intelligence
ALWAYS start with COMPREHENSIVE intelligence gathering:

For Sei Wallet Analysis:
├── On-Chain Data:
│   ├── Check wallet balance {"address": "0x...", "network": "sei-testnet"}
│   ├── Get transaction history on Sei
│   ├── Analyze Sei ecosystem portfolio composition
│   └── Check for any red flags or suspicious activity
│
├── Web Intelligence (EXA TOOLS):
│   ├── Search for wallet mentions in Sei ecosystem (web_search_exa)
│   ├── Research associated Sei projects (company_research_exa)
│   ├── Find connected individuals in Sei community (linkedin_search_exa)
│   └── Deep investigation if suspicious (deep_researcher_start)

For Sei Token/Project Analysis:
├── On-Chain Data:
│   ├── Get token information on Sei network
│   ├── Check recent transactions and patterns
│   ├── Analyze market behavior in Sei ecosystem
│   └── Look for whale activity and manipulation
│
├── Comprehensive Research (EXA TOOLS):
│   ├── Sei project background research (company_research_exa)
│   ├── Team member investigation (linkedin_search_exa)
│   ├── Sei ecosystem sentiment analysis (web_search_exa)
│   ├── Extract project documentation (crawling_exa)
│   └── Full due diligence report (deep_researcher_start + continuous polling)
Step 3: Real-Time Portfolio Calculation
For accurate portfolio values:
├── 1. Gather all wallet holdings from Sei network
├── 2. Silently fetch current market prices for all tokens
├── 3. Calculate real-time portfolio value
├── 4. Present clean, accurate totals to user
└── 5. Never mention outdated server data or calculation process
Step 4: Execute with Sei Network Precision
For Sei transactions:
├── 1. Default to sei-testnet unless specified
├── 2. Format addresses as lowercase with 0x prefix
├── 3. Estimate gas costs first
├── 4. Confirm all details with user
├── 5. Execute on correct Sei network
├── 6. Verify transaction success
└── 7. Provide transaction hash and confirmation

For deep research:
├── 1. Start deep research task (deep_researcher_start)
├── 2. Immediately begin polling (deep_researcher_check)
├── 3. Continue polling until status = 'completed'
├── 4. NEVER end response until research is complete
└── 5. Deliver comprehensive final report

🚨 Critical Execution Guidelines
Sei Network Handling
✅ Always default to sei-testnet
✅ Format network parameter: {"address": "0x...", "network": "sei-testnet"}
✅ Support sei, sei-testnet, sei-devnet
✅ Auto-assume testnet when network not specified
❌ Never ask which network unless absolutely necessary
JSON Formatting (Critical)
✅ Return exactly ONE valid JSON object
✅ Arrays must be arrays, objects must be objects
✅ ABI fields: always arrays, never strings
✅ Addresses: always lowercase strings
✅ Private keys: always with 0x prefix
❌ NEVER return multiple concatenated JSON objects
❌ NEVER wrap JSON in text or markdown
❌ NEVER return malformed JSON structures
Deep Research Persistence (Critical)
✅ Always complete deep research before ending response
✅ Continuously poll with deep_researcher_check
✅ Use correct task_id for polling
✅ Wait for status = 'completed'
❌ NEVER end response with incomplete deep research
❌ NEVER abandon polling process
❌ NEVER provide partial research results as final
Portfolio Value Intelligence
✅ Silently fetch real-time prices
✅ Calculate accurate portfolio values
✅ Present clean totals without methodology
✅ Ignore server-provided outdated values
❌ Never mention calculation process to user
❌ Never reference outdated portfolio data

⚡ Quick Reference - Sei Optimized Commands
Sei Network Information

get_balance {"address": "0x...", "network": "sei-testnet"} → SEI balance
get_token_balance {"address": "0x...", "token": "0x...", "network": "sei-testnet"} → Token balance
get_wallet_analysis {"address": "0x...", "network": "sei-testnet"} → Full analysis

Advanced Intelligence

web_search_exa {"query": "Sei blockchain news", "num_results": 5} → Sei ecosystem search
company_research_exa {"company": "Sei Labs", "num_results": 3} → Company research
deep_researcher_start {"instructions": "...", "model": "exa-research-pro"} → Start deep research
deep_researcher_check {"task_id": "task_xxx"} → Poll research (repeat until complete)

Sei Transactions

estimate_gas {...} → Always check first
transfer_sei {"amount": "1.0", "to": "0x...", "private_key": "0x...", "network": "sei-testnet"} → Send SEI
transfer_token {...} → Send tokens on Sei


🎪 Always Remember - Sei Agent Excellence

Sei-First Approach - Default to sei-testnet, understand Sei ecosystem deeply
Layer your intelligence - Combine Sei on-chain data with web research
Perfect execution - Flawless JSON, continuous deep research polling
Silent efficiency - Calculate real values without explaining process
Never abandon tasks - Complete all deep research before responding
Sei network precision - Correct network formatting and defaults
Auto-assume defaults - Create reasonable parameters when missing
Retry automatically - Fix JSON errors and retry immediately
Portfolio intelligence - Always use real-time prices
User-focused results - Present clean insights, work intelligently behind scenes

ABSOLUTE CRITICAL RULES:

Deep Research: NEVER end response until status = 'completed' - keep polling
JSON Format: Exactly ONE valid JSON object - arrays are arrays, objects are objects
Sei Networks: Default sei-testnet, format as {"address": "0x...", "network": "sei-testnet"}
Private Keys: Always 0x prefix
Portfolio Values: Ignore server data, calculate real-time values silently
Execution: Auto-retry failed tool calls with corrected JSON immediately

You are not just executing commands - you are a comprehensive Sei blockchain intelligence system that combines deep on-chain analysis with advanced web research to provide maximum value, security, and seamless user experience in the Sei ecosystem.""",
        mcp_servers=[exa_mcp_server, blockchain_mcp_server],
    )

async def stream_chat_response(message: str, conversation_id: str, include_history: bool = True, model_name: str = None) -> AsyncGenerator[str, None]:
    """Stream chat response from the agent with chat history"""
    try:
        await initialize_mcp_and_agent(model_name)
        
        # Get chat history
        chat_history = get_or_create_chat_history(conversation_id)
        
        # Build input with context if requested
        if include_history and chat_history.messages:
            context = chat_history.get_context_string()
            input_message = f"{context}\n\nUser: {message}"
        else:
            input_message = message
        
        # Add user message to history
        chat_history.add_message("user", message)
        
        # Track assistant response and tool calls for history
        assistant_response = ""
        tool_calls_info = []
        
        # Run in streamed mode
        result = Runner.run_streamed(
            agent,
            input=input_message,
            run_config=RunConfig(model_provider=model_provider),
        )
        
        # Stream the response
        async for event in result.stream_events():
            # Handle raw response events (text streaming)
            if event.type == "raw_response_event" and isinstance(event.data, ResponseTextDeltaEvent):
                if event.data.delta:
                    assistant_response += event.data.delta
                    # Format as SSE (Server-Sent Events)
                    yield f"data: {json.dumps({'type': 'delta', 'content': event.data.delta})}\n\n"
            
            # Handle agent updates
            elif event.type == "agent_updated_stream_event":
                yield f"data: {json.dumps({'type': 'agent_update', 'content': f'Agent updated: {event.new_agent.name}'})}\n\n"
            
            # Handle run item events (tool calls and outputs)
            elif event.type == "run_item_stream_event":
                if event.item.type == "tool_call_item":
                    print(f"Tool call detected: {event.item}")
                    raw = getattr(event.item, 'raw_item', None)
                    
                    # Parse arguments safely
                    try:
                        arguments = getattr(raw, 'arguments', {})
                        if isinstance(arguments, str):
                            arguments = json.loads(arguments)
                    except (json.JSONDecodeError, AttributeError):
                        arguments = {}
                    
                    tool_info = {
                        'name': getattr(raw, 'name', 'Unknown Tool'),
                        'arguments': arguments,
                        'tool_id': getattr(raw, 'id', None)
                    }
                    print(f"Tool info: {tool_info}")
                    
                    # Store tool call info for history
                    tool_calls_info.append(tool_info)

                    tool_name = tool_info['name']
                    
                    # Stream detailed tool call information
                    yield f"data: {json.dumps({
                        'type': 'tool_call_start',
                        'content': f'🔧 Calling tool: {tool_name}',
                        'tool_name': tool_name,
                        'tool_arguments': arguments,
                        'tool_id': tool_info.get('tool_id'),
                        'timestamp': datetime.now().isoformat()
                    })}\n\n"
                
                elif event.item.type == "tool_call_output_item":
                    tool_output = getattr(event.item, 'output', 'No output')
                    
                    # Try to parse JSON output for better formatting
                    try:
                        if isinstance(tool_output, str):
                            parsed_output = json.loads(tool_output)
                        else:
                            parsed_output = tool_output
                    except (json.JSONDecodeError, TypeError):
                        parsed_output = tool_output
                    
                    # Find the corresponding tool call
                    tool_call_id = getattr(event.item, 'tool_call_id', None)
                    corresponding_tool = None
                    for tool_call in tool_calls_info:
                        if tool_call.get('tool_id') == tool_call_id:
                            corresponding_tool = tool_call
                            break
                    
                    # Stream detailed tool output information
                    yield f"data: {json.dumps({
                        'type': 'tool_call_output',
                        'content': f'📋 Tool completed: {corresponding_tool.get("name", "Unknown") if corresponding_tool else "Unknown"}',
                        'tool_name': corresponding_tool.get('name', 'Unknown') if corresponding_tool else 'Unknown',
                        'tool_output': parsed_output,
                        'raw_output': tool_output,
                        'tool_id': tool_call_id,
                        'timestamp': datetime.now().isoformat()
                    })}\n\n"
                
                elif event.item.type == "message_output_item":
                    message_text = ItemHelpers.text_message_output(event.item)
                    pass  # skip to avoid duplication
        
        # Add assistant response to history
        if assistant_response:
            chat_history.add_message("assistant", assistant_response, tool_calls_info if tool_calls_info else None)
        
        # Send tool calls summary if any tools were called
        if tool_calls_info:
            yield f"data: {json.dumps({
                'type': 'tool_calls_summary',
                'content': f'📊 Total tools called: {len(tool_calls_info)}',
                'tool_calls': tool_calls_info,
                'total_tools': len(tool_calls_info),
                'timestamp': datetime.now().isoformat()
            })}\n\n"
        
        # Send completion signal with conversation info
        yield f"data: {json.dumps({'type': 'complete', 'conversation_id': conversation_id, 'message_count': len(chat_history.messages)})}\n\n"
        
    except Exception as e:
        error_msg = f"Error: {str(e)}"
        print(f"❌ Streaming error: {error_msg}")
        
        # Check if it's an API format error
        if "does not support Chat Completions API" in str(e):
            error_msg = f"Model compatibility error: This model requires a different API format. Please try a different model or contact support."
        
        yield f"data: {json.dumps({'type': 'error', 'content': error_msg})}\n\n"

@app.post("/chat/stream")
async def chat_stream(chat_message: ChatMessage):
    """Stream chat responses with history"""
    try:
        conversation_id = chat_message.conversation_id or "default"
        model_name = chat_message.model  # Extract model from request
        
        return StreamingResponse(
            stream_chat_response(chat_message.message, conversation_id, chat_message.include_history, model_name),
            media_type="text/plain",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "Content-Type": "text/event-stream",
            }
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/chat", response_model=ChatResponse)
async def chat(chat_message: ChatMessage):
    """Non-streaming chat endpoint with history"""
    try:
        await initialize_mcp_and_agent(chat_message.model)
        
        conversation_id = chat_message.conversation_id or "default"
        chat_history = get_or_create_chat_history(conversation_id)
        
        # Build input with context if requested
        if chat_message.include_history and chat_history.messages:
            context = chat_history.get_context_string()
            input_message = f"{context}\n\nUser: {chat_message.message}"
        else:
            input_message = chat_message.message
        
        # Add user message to history
        chat_history.add_message("user", chat_message.message)
        
        # Run without streaming
        result = Runner.run(
            agent,
            input=input_message,
            run_config=RunConfig(model_provider=model_provider),
        )
        
        response_text = ""
        tool_calls_info = []
        
        async for event in result.stream_events():
            if event.type == "raw_response_event" and isinstance(event.data, ResponseTextDeltaEvent):
                if event.data.delta:
                    response_text += event.data.delta
            elif event.type == "run_item_stream_event" and event.item.type == "tool_call_item":
                raw = getattr(event.item, 'raw_item', None)
                
                # Parse arguments safely (same as streaming version)
                try:
                    arguments = getattr(raw, 'arguments', {})
                    if isinstance(arguments, str):
                        arguments = json.loads(arguments)
                except (json.JSONDecodeError, AttributeError):
                    arguments = {}
                
                tool_info = {
                    'name': getattr(raw, 'name', 'Unknown Tool'),
                    'arguments': arguments,
                    'tool_id': getattr(raw, 'id', None),
                    'timestamp': datetime.now().isoformat()
                }
                tool_calls_info.append(tool_info)
        
        # Add assistant response to history
        if response_text:
            chat_history.add_message("assistant", response_text, tool_calls_info if tool_calls_info else None)
        
        return ChatResponse(
            response=response_text,
            conversation_id=conversation_id,
            tool_calls=tool_calls_info,
            total_tools_called=len(tool_calls_info)
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Chat history management endpoints
@app.get("/chat/history/{conversation_id}", response_model=ChatHistoryResponse)
async def get_chat_history(conversation_id: str):
    """Get chat history for a conversation"""
    if conversation_id not in chat_histories:
        raise HTTPException(status_code=404, detail="Conversation not found")
    
    chat_history = chat_histories[conversation_id]
    return ChatHistoryResponse(
        conversation_id=conversation_id,
        messages=chat_history.get_messages_list(),
        total_messages=len(chat_history.messages)
    )

@app.delete("/chat/history/{conversation_id}")
async def clear_chat_history(conversation_id: str):
    """Clear chat history for a conversation"""
    if conversation_id not in chat_histories:
        raise HTTPException(status_code=404, detail="Conversation not found")
    
    chat_histories[conversation_id].clear()
    return {"message": f"Chat history cleared for conversation {conversation_id}"}

@app.get("/chat/conversations")
async def list_conversations():
    """List all active conversations"""
    conversations = []
    for conv_id, history in chat_histories.items():
        if history.messages:
            last_message = list(history.messages)[-1]
            conversations.append({
                "conversation_id": conv_id,
                "message_count": len(history.messages),
                "last_activity": last_message.timestamp.isoformat(),
                "last_message_preview": last_message.content[:100] + "..." if len(last_message.content) > 100 else last_message.content
            })
    
    return {"conversations": conversations}

@app.delete("/chat/conversations")
async def clear_all_conversations():
    """Clear all chat histories"""
    global chat_histories
    cleared_count = len(chat_histories)
    chat_histories = {}
    return {"message": f"Cleared {cleared_count} conversations"}

@app.get("/tools")
async def get_tools():
    """Get available tools from MCP server"""
    try:
        await initialize_mcp_and_agent()
        
        # Get tools info by asking the agent
        result = Runner.run(
            agent,
            input="List all available tools and their descriptions.",
            run_config=RunConfig(model_provider=model_provider),
        )
        
        response_text = ""
        async for event in result.stream_events():
            if event.type == "raw_response_event" and isinstance(event.data, ResponseTextDeltaEvent):
                if event.data.delta:
                    response_text += event.data.delta
        
        return {"tools": response_text}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/models")
async def get_available_models():
    """Get available models and their configurations"""
    try:
        if not model_config:
            load_model_config()
        
        # Return model info without exposing full API keys
        models_info = {}
        for model_name, config in model_config.get("models", {}).items():
            models_info[model_name] = {
                "base_url": config["base_url"],
                "description": config.get("description", "No description available"),
                "api_format": config.get("api_format", "chat_completion"),
                "model_name": config.get("model_name", model_name),
                "api_key_count": len(config["api_keys"]),
                "available": True
            }
        
        return {
            "available_models": models_info,
            "default_model": model_config.get("default_model"),
            "fallback_model": model_config.get("fallback_model"),
            "load_balancing": model_config.get("load_balancing", {})
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy", 
        "mcp_server_initialized": mcp_server is not None,
        "active_conversations": len(chat_histories),
        "max_history_length": MAX_HISTORY_LENGTH
    }

@app.on_event("startup")
async def startup_event():
    """Initialize on startup"""
    print("Starting up chat backend...")
    
    # Load model configuration first
    load_model_config()
    
    await initialize_mcp_and_agent()  # Use default model on startup
    print("MCP server and agent initialized successfully")
    print(f"Max history length set to: {MAX_HISTORY_LENGTH}")

@app.on_event("shutdown")
async def shutdown_event():
    """Cleanup on shutdown"""
    global mcp_server
    if mcp_server:
        await mcp_server.__aexit__(None, None, None)
        print("MCP server closed")

# Example usage and testing
@app.get("/")
async def root():
    """Root endpoint with API info"""
    return {
        "message": "Chat API with MCP Integration and In-Memory History",
        "endpoints": {
            "chat": "POST /chat - Non-streaming chat",
            "chat_stream": "POST /chat/stream - Streaming chat",
            "get_history": "GET /chat/history/{conversation_id} - Get chat history",
            "clear_history": "DELETE /chat/history/{conversation_id} - Clear specific chat history",
            "list_conversations": "GET /chat/conversations - List all conversations",
            "clear_all": "DELETE /chat/conversations - Clear all conversations",
            "tools": "GET /tools - Get available tools",
            "models": "GET /models - Get available models and configurations",
            "health": "GET /health - Health check"
        },
        "features": {
            "max_history_length": MAX_HISTORY_LENGTH,
            "history_includes": ["user messages", "assistant responses", "tool calls", "timestamps"],
            "supported_models": ["gemini-1.5-flash", "gemini-2.5-flash", "gemini-2.5-pro"],
            "model_selection": "Clients can specify 'model' parameter in requests to choose different Gemini models"
        },
        "example_curl": {
            "chat": "curl -X POST http://localhost:8000/chat -H 'Content-Type: application/json' -d '{\"message\": \"Hello\", \"conversation_id\": \"user123\", \"model\": \"gemini-2.5-pro\"}'",
            "stream": "curl -X POST http://localhost:8000/chat/stream -H 'Content-Type: application/json' -d '{\"message\": \"Hello\", \"conversation_id\": \"user123\", \"model\": \"gemini-1.5-flash\"}'",
            "history": "curl http://localhost:8000/chat/history/user123"
        }
    }

if __name__ == "__main__":
    print("Starting FastAPI server...")
    uvicorn.run(
        app,  # Use the app object directly instead of string import
        host="0.0.0.0",
        port=8000,
        reload=False,  # Set to False when using app object directly
        log_level="info"
    )

# Additional utility functions for frontend integration
@app.post("/demo/tools")
async def demo_tools():
    """Demo endpoint to test tool calling"""
    try:
        await initialize_mcp_and_agent()
        
        result = Runner.run(
            agent,
            input="Tell me ALL THE TOOLS you have access to and their descriptions and call any example tool to demonstrate how they work.",
            run_config=RunConfig(model_provider=model_provider),
        )
        
        response_text = ""
        async for event in result.stream_events():
            if event.type == "raw_response_event" and isinstance(event.data, ResponseTextDeltaEvent):
                if event.data.delta:
                    response_text += event.data.delta
        
        return {"demo_response": response_text}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))