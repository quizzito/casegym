import { useState } from 'react'
import { getIdToken } from '../firebase'

function parseTranscript(raw) {
  let inRec = false, inTech = false
  return raw.split('\n').filter(l => l.trim()).map(line => {
    if (line.startsWith('INTERVIEWER:'))       return { type: 'interviewer', text: line.replace('INTERVIEWER:', '').trim() }
    if (line.startsWith('VP CANDIDATE:'))       return { type: 'candidate',   text: line.replace('VP CANDIDATE:', '').trim() }
    if (line.startsWith('FINAL RECOMMENDATION:')) { inRec = true; inTech = false; return { type: 'rec_header' } }
    if (line.startsWith('STRENGTHS OF'))        { inRec = false; inTech = false; return { type: 'str_header' } }
    if (line.startsWith('WHAT MOST'))           { inRec = false; inTech = true;  return { type: 'mis_header' } }
    if (line.startsWith('- '))                  return { type: inTech ? 'mistake' : 'strength', text: line.replace('- ', '').trim() }
    if (inRec && line.trim())                   return { type: 'rec_body', text: line.trim() }
    return null
  }).filter(Boolean)
}

export function SimulatePanel({ onBack, companies, role }) {
  const [companyId, setCompanyId] = useState(companies[0]?.id || '')
  const [caseText, setCaseText]   = useState('')
  const [transcript, setTranscript] = useState(null)
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState('')

  async function handleSimulate() {
    setLoading(true); setTranscript(null); setError('')
    try {
      const token = await getIdToken()
      const res = await fetch('/api/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ case_text: caseText, company_id: companyId, role, id_token: token })
      })
      if (!res.ok) throw new Error(await res.text())
      const data = await res.json()
      setTranscript(data.transcript)
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }

  const parsed = transcript ? parseTranscript(transcript) : []

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-6">
      <div className="flex items-center justify-between mb-6 px-1">
        <div className="flex items-center gap-3">
          <span className="text-sm font-bold text-gray-900">CaseGym</span>
          <span className="text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded-full font-medium">Simulate</span>
        </div>
        <button onClick={onBack} className="text-xs text-gray-400 hover:text-gray-600">← Back</button>
      </div>
      {!transcript ? (
        <div className="max-w-xl mx-auto bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <h2 className="text-sm font-semibold text-gray-900 mb-1">Paste a case</h2>
          <p className="text-xs text-gray-400 mb-4">Watch the AI play both interviewer and top 1% VP candidate solving the case.</p>
          {companies.length > 1 && (
            <select value={companyId} onChange={e => setCompanyId(e.target.value)}
              className="mb-3 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500">
              {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
          <textarea value={caseText} onChange={e => setCaseText(e.target.value)}
            placeholder="Paste any case prompt here..."
            className="w-full min-h-[160px] text-sm border border-gray-200 rounded-xl p-4 resize-none focus:outline-none focus:ring-2 focus:ring-purple-500"/>
          {error && <p className="text-xs text-red-500 mt-2">{error}</p>}
          <button onClick={handleSimulate} disabled={loading || !caseText.trim()}
            className="mt-4 w-full py-3 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-200 disabled:text-gray-400 text-white text-sm font-semibold rounded-xl">
            {loading ? 'Simulating... (~15s)' : 'Run VP Simulation'}
          </button>
          {loading && (
            <div className="flex items-center justify-center gap-2 mt-3">
              <div className="w-4 h-4 border-2 border-purple-600 border-t-transparent rounded-full animate-spin" />
              <p className="text-xs text-gray-400">Running the full interview...</p>
            </div>
          )}
        </div>
      ) : (
        <div className="max-w-2xl mx-auto bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">VP Simulation</h2>
              <p className="text-xs text-gray-400">Top 1% approach</p>
            </div>
            <button onClick={() => { setTranscript(null); setCaseText('') }}
              className="text-xs text-gray-400 hover:text-gray-600">Try another</button>
          </div>
          <div className="px-6 py-4 space-y-3 max-h-[70vh] overflow-y-auto">
            {parsed.map((item, i) => {
              if (item.type === 'interviewer') return (
                <div key={i} className="flex justify-start">
                  <div className="max-w-[80%] bg-gray-100 rounded-2xl rounded-bl-sm px-4 py-3">
                    <p className="text-[10px] font-medium text-gray-400 mb-1">Interviewer</p>
                    <p className="text-sm text-gray-800 leading-relaxed">{item.text}</p>
                  </div>
                </div>
              )
              if (item.type === 'candidate') return (
                <div key={i} className="flex justify-end">
                  <div className="max-w-[80%] bg-purple-600 rounded-2xl rounded-br-sm px-4 py-3">
                    <p className="text-[10px] font-medium text-purple-200 mb-1">VP Candidate</p>
                    <p className="text-sm text-white leading-relaxed">{item.text}</p>
                  </div>
                </div>
              )
              if (item.type === 'rec_header') return <p key={i} className="text-xs font-semibold text-gray-500 uppercase tracking-wide pt-4">Final recommendation</p>
              if (item.type === 'str_header') return <p key={i} className="text-xs font-semibold text-green-600 uppercase tracking-wide pt-2">Strengths of this approach</p>
              if (item.type === 'mis_header') return <p key={i} className="text-xs font-semibold text-red-500 uppercase tracking-wide pt-2">What most candidates get wrong</p>
              if (item.type === 'rec_body') return <div key={i} className="bg-gray-900 rounded-xl px-4 py-3"><p className="text-sm text-white leading-relaxed">{item.text}</p></div>
              if (item.type === 'strength') return <div key={i} className="flex gap-2"><span className="text-green-500 shrink-0">✓</span><p className="text-sm text-gray-700">{item.text}</p></div>
              if (item.type === 'mistake')  return <div key={i} className="flex gap-2"><span className="text-red-400 shrink-0">✗</span><p className="text-sm text-gray-700">{item.text}</p></div>
              return null
            })}
          </div>
        </div>
      )}
    </div>
  )
}