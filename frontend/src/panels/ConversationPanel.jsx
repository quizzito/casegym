import { useEffect, useRef } from 'react'

export function ConversationPanel({ messages, statusText, isRecording, isConnected,
  conversationMode, onStartRecording, onStopRecording }) {
  const bottomRef = useRef(null)
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  const speakerLabel = conversationMode === 'interviewer' ? 'AI Candidate' : 'Interviewer'

  return (
    <div className="flex flex-col h-full bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">
            {conversationMode === 'interviewer' ? 'You are the Interviewer' : 'Interview'}
          </h2>
          <p className="text-xs text-gray-400 mt-0.5">Strategy Analyst · Case Interview</p>
        </div>
        <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-400' : 'bg-gray-300'}`} />
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {messages.length === 0 && (
          <p className="text-sm text-gray-400 text-center mt-8">
            Configure your session and press Start.
          </p>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] px-4 py-3 rounded-2xl text-sm leading-relaxed ${
              msg.role === 'user'
                ? 'bg-blue-600 text-white rounded-br-sm'
                : 'bg-gray-100 text-gray-800 rounded-bl-sm'
            }`}>
              <p className={`text-[10px] font-medium mb-1 ${
                msg.role === 'user' ? 'text-blue-200' : 'text-gray-400'
              }`}>
                {msg.role === 'user' ? 'You' : (msg.speaker || speakerLabel)}
              </p>
              {msg.text}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {statusText && (
        <div className="px-6 py-2 bg-amber-50 border-t border-amber-100">
          <p className="text-xs text-amber-600 text-center">{statusText}</p>
        </div>
      )}

      <div className="px-6 py-5 border-t border-gray-100 flex items-center justify-center">
        <button
          onMouseDown={onStartRecording} onMouseUp={onStopRecording}
          onTouchStart={onStartRecording} onTouchEnd={onStopRecording}
          disabled={!isConnected}
          className={`relative w-16 h-16 rounded-full flex items-center justify-center transition-all duration-150 ${
            isRecording ? 'bg-red-500 scale-110 shadow-lg shadow-red-200'
            : isConnected ? 'bg-blue-600 hover:bg-blue-700 shadow-md'
            : 'bg-gray-200 cursor-not-allowed'
          }`}>
          {isRecording && (
            <span className="absolute inset-0 rounded-full bg-red-400 animate-ping opacity-40" />
          )}
          <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 1a4 4 0 0 1 4 4v6a4 4 0 0 1-8 0V5a4 4 0 0 1 4-4zm6.5 9a.5.5 0 0 1 1 0 7.5 7.5 0 0 1-15 0 .5.5 0 0 1 1 0 6.5 6.5 0 0 0 13 0zM11.5 19h1v3h-1v-3z"/>
          </svg>
        </button>
        <p className="ml-4 text-xs text-gray-400">
          {isRecording ? 'Release to send' : 'Hold to speak'}
        </p>
      </div>
    </div>
  )
}