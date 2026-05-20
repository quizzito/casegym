import { useState } from 'react'
import { getIdToken } from '../firebase'
import { ScoreRow } from '../components/ScoreRow'

export function EvaluatePanel({ onBack, companies, role }) {
  const [companyId, setCompanyId] = useState(companies[0]?.id || '')
  const [caseText, setCaseText]   = useState('')
  const [result, setResult]       = useState(null)
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState('')

  async function handleSolve() {
    setLoading(true); setResult(null); setError('')
    try {
      const token = await getIdToken()
      const res = await fetch('/api/solve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ case_text: caseText, company_id: companyId, role, id_token: token })
      })
      if (!res.ok) throw new Error(await res.text())
      setResult(await res.json())
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-6">
      <div className="flex items-center justify-between mb-6 px-1">
        <div className="flex items-center gap-3">
          <span className="text-sm font-bold text-gray-900">CaseGym</span>
          <span className="text-xs bg-amber-100 text-amber-700 px-2 py-1 rounded-full font-medium">Evaluate</span>
        </div>
        <button onClick={onBack} className="text-xs text-gray-400 hover:text-gray-600">← Back</button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 flex flex-col">
          <h2 className="text-sm font-semibold text-gray-900 mb-1">Paste a case</h2>
          <p className="text-xs text-gray-400 mb-4">The AI solves it step by step at the top 1% level and rates it against the company rubric.</p>
          {companies.length > 1 && (
            <select value={companyId} onChange={e => setCompanyId(e.target.value)}
              className="mb-3 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
          <textarea value={caseText} onChange={e => setCaseText(e.target.value)}
            placeholder="Paste the full case prompt here..."
            className="flex-1 w-full min-h-[200px] text-sm border border-gray-200 rounded-xl p-4 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"/>
          {error && <p className="text-xs text-red-500 mt-2">{error}</p>}
          <button onClick={handleSolve} disabled={loading || !caseText.trim()}
            className="mt-4 w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-400 text-white text-sm font-semibold rounded-xl">
            {loading ? 'Solving... (this takes ~10s)' : 'Solve & Score'}
          </button>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 overflow-y-auto">
          {!result && !loading && (
            <div className="flex items-center justify-center h-full text-center px-4">
              <p className="text-sm text-gray-400">Results appear here after you click Solve & Score.</p>
            </div>
          )}
          {loading && (
            <div className="flex flex-col items-center justify-center h-full gap-3">
              <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-gray-400">Building the solution...</p>
            </div>
          )}
          {result && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-gray-900">VP-level solution</h2>
                <span className="text-2xl font-bold text-gray-900">{result.overall_score}<span className="text-sm font-normal text-gray-400">/10</span></span>
              </div>
              {Object.entries(result.solution || {}).filter(([k]) => k !== 'final_recommendation').map(([key, val]) => val && (
                <div key={key} className="flex gap-3">
                  <span className="text-xs font-bold text-blue-600 mt-0.5 uppercase shrink-0">{key.replace('_', ' ')}</span>
                  <p className="text-sm text-gray-700 leading-relaxed">{val}</p>
                </div>
              ))}
              {result.solution?.final_recommendation && (
                <div className="bg-gray-900 rounded-xl px-4 py-4">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Final recommendation</p>
                  <p className="text-sm text-white leading-relaxed">{result.solution.final_recommendation}</p>
                </div>
              )}
              {result.rubric_scores && (
                <div className="space-y-2">
                  {Object.entries(result.rubric_scores).map(([k, v]) => (
                    <ScoreRow key={k} label={k} score={v.score} explanation={v.explanation} />
                  ))}
                </div>
              )}
              {result.key_insight && (
                <div className="bg-blue-50 rounded-xl px-4 py-4 border border-blue-100">
                  <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide mb-2">What most candidates miss</p>
                  <p className="text-sm text-gray-700 leading-relaxed">{result.key_insight}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}