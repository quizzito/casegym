export function ScoreRow({ label, score, explanation }) {
  const color = score >= 8 ? 'text-green-600' : score >= 6 ? 'text-amber-500' : 'text-red-500'
  const bg    = score >= 8 ? 'bg-green-50'   : score >= 6 ? 'bg-amber-50'    : 'bg-red-50'
  return (
    <div className={`${bg} rounded-xl px-4 py-3`}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
          {label.replace(/_/g, ' ')}
        </span>
        <span className={`text-sm font-bold ${color}`}>{score}/10</span>
      </div>
      <p className="text-xs text-gray-600 leading-relaxed">{explanation}</p>
    </div>
  )
}