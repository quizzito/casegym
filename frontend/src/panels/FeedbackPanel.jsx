import { ScoreRow } from '../components/ScoreRow'

export function FeedbackPanel({ feedback, isLoading }) {
  if (isLoading) return (
    <div className="flex flex-col h-full bg-white rounded-2xl shadow-sm border border-gray-100 items-center justify-center gap-3">
      <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
      <p className="text-sm text-gray-400">Generating feedback...</p>
    </div>
  )

  if (!feedback) return (
    <div className="flex flex-col h-full bg-white rounded-2xl shadow-sm border border-gray-100 items-center justify-center px-8 text-center">
      <div className="w-12 h-12 bg-gray-100 rounded-2xl flex items-center justify-center mb-4">
        <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
        </svg>
      </div>
      <p className="text-sm text-gray-400">Feedback appears after each response.</p>
    </div>
  )

  const strengths    = (feedback.strengths || []).filter(Boolean)
  const improvements = (feedback.areas_of_improvement || []).filter(Boolean)
  const nextSteps    = (feedback.actionable_next_steps || []).filter(Boolean)

  return (
    <div className="flex flex-col h-full bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Feedback</h2>
          <p className="text-xs text-gray-400 mt-0.5">After your last response</p>
        </div>
        <span className="text-2xl font-bold text-gray-900">
          {feedback.overall_score}<span className="text-sm font-normal text-gray-400">/10</span>
        </span>
      </div>
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {feedback.scores && Object.keys(feedback.scores).length > 0 && (
          <div className="space-y-2">
            {Object.entries(feedback.scores).map(([key, val]) => (
              <ScoreRow key={key} label={key} score={val.score} explanation={val.explanation} />
            ))}
          </div>
        )}
        {strengths.length > 0 && (
          <div className="bg-green-50 rounded-xl px-4 py-4">
            <p className="text-xs font-semibold text-green-700 uppercase tracking-wide mb-3">What you did well</p>
            <div className="space-y-2">
              {strengths.map((s, i) => (
                <div key={i} className="flex gap-2 items-start">
                  <span className="text-green-500 mt-0.5 shrink-0">✓</span>
                  <p className="text-xs text-gray-700 leading-relaxed">{s}</p>
                </div>
              ))}
            </div>
          </div>
        )}
        {improvements.length > 0 && (
          <div className="bg-amber-50 rounded-xl px-4 py-4">
            <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-3">Areas to improve</p>
            <div className="space-y-2">
              {improvements.map((s, i) => (
                <div key={i} className="flex gap-2 items-start">
                  <span className="text-amber-500 mt-0.5 shrink-0">△</span>
                  <p className="text-xs text-gray-700 leading-relaxed">{s}</p>
                </div>
              ))}
            </div>
          </div>
        )}
        {feedback.top_1_percent_response && (
          <div className="bg-blue-50 rounded-xl px-4 py-4 border border-blue-100">
            <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide mb-2">How a top 1% would respond</p>
            <p className="text-sm text-gray-700 leading-relaxed italic">"{feedback.top_1_percent_response}"</p>
          </div>
        )}
        {nextSteps.length > 0 && (
          <div className="bg-gray-900 rounded-xl px-4 py-4">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Before next session</p>
            <div className="space-y-2">
              {nextSteps.map((s, i) => (
                <div key={i} className="flex gap-2 items-start">
                  <span className="text-blue-400 text-xs mt-0.5 shrink-0">→</span>
                  <p className="text-xs text-gray-300 leading-relaxed">{s}</p>
                </div>
              ))}
            </div>
          </div>
        )}
        {feedback.one_thing_to_improve && (
          <div className="border border-red-200 rounded-xl px-4 py-3">
            <p className="text-xs font-semibold text-red-600 uppercase tracking-wide mb-1">#1 thing to fix</p>
            <p className="text-sm text-gray-800 leading-relaxed">{feedback.one_thing_to_improve}</p>
          </div>
        )}
      </div>
    </div>
  )
}