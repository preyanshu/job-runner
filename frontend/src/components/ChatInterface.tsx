'use client'

import { useState, useRef, useEffect } from 'react'

// Simple SVG Icons
const SendIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="22" y1="2" x2="11" y2="13"></line>
    <polygon points="22,2 15,22 11,13 2,9"></polygon>
  </svg>
)

const BotIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="3" y="11" width="18" height="10" rx="2" ry="2"></rect>
    <circle cx="12" cy="5" r="2"></circle>
    <path d="m12 7-3 3h6l-3-3z"></path>
  </svg>
)

const UserIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
    <circle cx="12" cy="7" r="4"></circle>
  </svg>
)

interface ToolCall {
  name: string
  arguments: any
  tool_id?: string
  timestamp?: string
}

interface ToolOutput {
  tool_name: string
  tool_output: any
  raw_output: any
  tool_id?: string
  timestamp?: string
}

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
  tool_calls?: ToolCall[]
  tool_outputs?: ToolOutput[]
  isStreaming?: boolean
}

export default function ChatInterface() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [streamingContent, setStreamingContent] = useState('')
  const [currentToolCalls, setCurrentToolCalls] = useState<ToolCall[]>([])
  const [currentToolOutputs, setCurrentToolOutputs] = useState<ToolOutput[]>([])
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const [conversationId] = useState(() => `conv_${Date.now()}`)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages, streamingContent, currentToolCalls, currentToolOutputs])

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return

    const userMessage: Message = {
      id: `msg_${Date.now()}`,
      role: 'user',
      content: input.trim(),
      timestamp: new Date(),
    }

    setMessages(prev => [...prev, userMessage])
    setInput('')
    setIsLoading(true)
    setStreamingContent('')
    setCurrentToolCalls([])
    setCurrentToolOutputs([])

    // Create streaming assistant message
    const assistantMessage: Message = {
      id: `msg_${Date.now() + 1}`,
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      isStreaming: true,
      tool_calls: [],
      tool_outputs: [],
    }

    setMessages(prev => [...prev, assistantMessage])

    try {
      const response = await fetch('http://localhost:8000/chat/stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: userMessage.content,
          conversation_id: conversationId,
          include_history: true,
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to send message')
      }

      const reader = response.body?.getReader()
      if (!reader) throw new Error('No reader available')

      let finalContent = ''
      let finalToolCalls: ToolCall[] = []
      let finalToolOutputs: ToolOutput[] = []

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = new TextDecoder().decode(value)
        const lines = chunk.split('\n')

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6))

              switch (data.type) {
                case 'delta':
                  finalContent += data.content
                  setStreamingContent(finalContent)
                  break

                case 'tool_call_start':
                  const newToolCall: ToolCall = {
                    name: data.tool_name,
                    arguments: data.tool_arguments,
                    tool_id: data.tool_id,
                    timestamp: data.timestamp,
                  }
                  finalToolCalls.push(newToolCall)
                  setCurrentToolCalls([...finalToolCalls])
                  break

                case 'tool_call_output':
                  const newToolOutput: ToolOutput = {
                    tool_name: data.tool_name,
                    tool_output: data.tool_output,
                    raw_output: data.raw_output,
                    tool_id: data.tool_id,
                    timestamp: data.timestamp,
                  }
                  finalToolOutputs.push(newToolOutput)
                  setCurrentToolOutputs([...finalToolOutputs])
                  break

                case 'complete':
                  // Update final message
                  setMessages(prev => prev.map(msg => 
                    msg.id === assistantMessage.id
                      ? {
                          ...msg,
                          content: finalContent,
                          tool_calls: finalToolCalls,
                          tool_outputs: finalToolOutputs,
                          isStreaming: false,
                        }
                      : msg
                  ))
                  setStreamingContent('')
                  setCurrentToolCalls([])
                  setCurrentToolOutputs([])
                  break

                case 'error':
                  console.error('Stream error:', data.content)
                  break
              }
            } catch (e) {
              console.error('Error parsing SSE data:', e)
            }
          }
        }
      }
    } catch (error) {
      console.error('Error sending message:', error)
      setMessages(prev => prev.map(msg => 
        msg.id === assistantMessage.id
          ? { ...msg, content: 'Sorry, there was an error processing your request.', isStreaming: false }
          : msg
      ))
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 p-4">
        <div className="max-w-4xl mx-auto flex items-center space-x-3">
          <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center">
            <BotIcon />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Vincent</h1>
            <p className="text-sm text-gray-500">Blockchain AI Assistant</p>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 scrollbar-thin">
        <div className="max-w-4xl mx-auto space-y-6">
          {messages.length === 0 && (
            <div className="text-center py-12">
              <div className="w-12 h-12 bg-gray-400 rounded-full flex items-center justify-center mx-auto mb-4">
                <BotIcon />
              </div>
              <h2 className="text-xl font-medium text-gray-700 mb-2">
                Welcome to Vincent AI
              </h2>
              <p className="text-gray-500">
                Your blockchain intelligence assistant. Ask me anything about wallets, tokens, NFTs, blockchain analysis, job monitoring, or comprehensive analytics.
              </p>
            </div>
          )}

          {messages.map((message) => (
            <div key={message.id} className="animate-fadeIn">
              <div className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`flex space-x-3 max-w-3xl ${message.role === 'user' ? 'flex-row-reverse space-x-reverse' : ''}`}>
                  {/* Avatar */}
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                    message.role === 'user' 
                      ? 'bg-blue-600 text-white' 
                      : 'bg-gray-600 text-white'
                  }`}>
                    {message.role === 'user' ? <UserIcon /> : <BotIcon />}
                  </div>

                  {/* Message Content */}
                  <div className={`flex-1 ${message.role === 'user' ? 'text-right' : ''}`}>
                    <div className={`inline-block p-4 rounded-2xl ${
                      message.role === 'user'
                        ? 'bg-blue-600 text-white'
                        : 'bg-white border border-gray-200 text-gray-900'
                    }`}>
                      <p className="whitespace-pre-wrap">{message.content}</p>
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      {message.timestamp.toLocaleTimeString()}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input */}
      <div className="bg-white border-t border-gray-200 p-4">
        <div className="max-w-4xl mx-auto">
          <div className="flex space-x-4">
            <div className="flex-1 relative">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage()}
                placeholder="Ask Vincent about blockchain analysis, job monitoring, or any topic..."
                disabled={isLoading}
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none disabled:opacity-50 disabled:cursor-not-allowed"
              />
            </div>
            <button
              onClick={sendMessage}
              disabled={isLoading || !input.trim()}
              className="px-6 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center space-x-2"
            >
              {isLoading ? (
                <div className="typing-dots">
                  <span></span>
                  <span></span>
                  <span></span>
                </div>
              ) : (
                <SendIcon />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}