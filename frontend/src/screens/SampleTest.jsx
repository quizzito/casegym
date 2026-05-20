import { useState } from 'react'
import { getIdToken } from '../firebase'
import { useAudioRecorder } from '../hooks/useAudioRecorder'

export function SampleTest({ onComplete, onSkip }) {
  const [step, setStep]             = useState('intro')
  const [question, setQuestion]     = useState(null)
  const [selected, setSelected]     = useState(null)
  const [result, setResult]         = useState(null)
  const [loading, setLoading]       = useState(false)
  const { isRecording, startRecording, stopRecording } = useAudioRecorder()

  async function loadQuestion() {
    const res = await fetch('/api/sample-test/question')
    setQuestion(await res.json())
    setStep('question')
  }

  async function submitAnswer(text) {
    setLoading(true)
    try {
      const token = await getIdToken()
      const res = await fetch('/api/sample-test/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answer_text: text, id_token: token })
      })
      setResult(await res.json())
      setStep('result')
    } finally { setLoading(false) }
  }

  async function handleVoiceStop() {
    await stopRecording()
    if (selected !== null) await submitAnswer(question.options[selected])
  }

  if (step === 'intro') return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center">
        <div className="w-12 h-12 bg-blue-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
        </div>
        <h2 className="text-lg font-bold text-gray-900 mb-2">Quick system check</h2>
        <p className="text-sm text-gray-500 mb-6 leading-relaxed">
          Answer one quick question to verify audio, feedback, and scoring are working — takes 60 seconds.
        </p>
        <div className="flex gap-3">
          <button onClick={onSkip} className="flex-1 py-3 border border-gray-200 text-gray-600 text-sm rounded-xl hover:bg-gray-50">Skip</button>
          <button onClick={loadQuestion} className="flex-1 py-3 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700">Start test</button>
        </div>
      </div>
    </div>
  )

  if (step === 'question' && question) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="max-w-xl w-full bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide mb-3">Sample test</p>
        <p className="text-sm text-gray-800 leading-relaxed mb-5">{question.question}</p>
        <div className="space-y-2 mb-5">
          {question.options.map((opt, i) => (
            <button key={i} onClick={() => setSelected(i)}
              className={`w-full text-left px-4 py-3 rounded-xl border text-sm transition-all ${
                selected === i ? 'border-blue-500 bg-blue-50 text-blue-800' : 'border-gray-200 text-gray-700 hover:border-gray-300'
              }`}>
              {opt}
            </button>
          ))}
        </div>
        <div className="flex gap-3">
          <button onMouseDown={startRecording} onMouseUp={handleVoiceStop}
            className={`flex-1 py-3 rounded-xl text-sm font-medium flex items-center justify-center gap-2 transition-all ${
              isRecording ? 'bg-red-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}>
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 1a4 4 0 0 1 4 4v6a4 4 0 0 1-8 0V5a4 4 0 0 1 4-4z"/>
            </svg>
            {isRecording ? 'Release to submit' : 'Hold to speak'}
          </button>
          <button onClick={() => selected !== null && submitAnswer(question.options[selected])}
            disabled={selected === null || loading}
            className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-400 text-white text-sm font-semibold rounded-xl">
            {loading ? 'Evaluating...' : 'Submit'}
          </button>
        </div>
      </div>
    </div>
  )

  if (step === 'result' && result) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="max-w-xl w-full bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-gray-900">Sample test result</h2>
          <span className={`text-2xl font-bold ${result.score >= 7 ? 'text-green-600' : result.score >= 5 ? 'text-amber-500' : 'text-red-500'}`}>
            {result.score}/10
          </span>
        </div>
        <div className="bg-green-50 rounded-xl px-4 py-3">
          <p className="text-xs font-semibold text-green-700 uppercase tracking-wide mb-1">What you got right</p>
          <p className="text-sm text-gray-700">{result.what_they_got_right}</p>
        </div>
        <div className="bg-amber-50 rounded-xl px-4 py-3">
          <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-1">To improve</p>
          <p className="text-sm text-gray-700">{result.what_to_improve}</p>
        </div>
        <div className="bg-blue-50 rounded-xl px-4 py-4 border border-blue-100">
          <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide mb-2">Ideal answer</p>
          <p className="text-sm text-gray-700 italic leading-relaxed">"{result.ideal_answer}"</p>
        </div>
        <button onClick={onComplete}
          className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl">
          Start practicing →
        </button>
      </div>
    </div>
  )
}