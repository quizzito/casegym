import { useState, useCallback, useRef, useEffect } from 'react'
import { auth, logout, getIdToken } from './firebase'
import { onAuthStateChanged } from 'firebase/auth'
import { Login }             from './components/Login'
import { SampleTest }        from './screens/SampleTest'
import { DownloadButton }    from './components/DownloadButton'
import { ConversationPanel } from './panels/ConversationPanel'
import { FeedbackPanel }     from './panels/FeedbackPanel'
import { EvaluatePanel }     from './panels/EvaluatePanel'
import { SimulatePanel }     from './panels/SimulatePanel'
import { useAudioRecorder }  from './hooks/useAudioRecorder'
import { useWebSocket }      from './hooks/useWebSocket'

const CONVERSATION_MODES = [
  { id: 'candidate',   label: 'You as Candidate',  desc: 'AI plays interviewer. You answer.',        badge: 'bg-blue-100 text-blue-700' },
  { id: 'interviewer', label: 'You as Interviewer', desc: 'AI plays candidate. You ask questions.',   badge: 'bg-teal-100 text-teal-700' },
]

const ROLES = [
  { id: 'analyst',   label: 'Analyst',   desc: 'Entry level. Structured thinking, basic business logic.' },
  { id: 'manager',   label: 'Manager',   desc: 'Mid-level. Lead with hypothesis, defend recommendation.' },
  { id: 'executive', label: 'Executive', desc: 'Senior. Strategic framing, decisive, world-class comms.' },
]

const CASE_TYPES = [
  { id: 'revenue_decline', label: 'Revenue Decline',  context: 'Client is a bank with 15% YoY revenue decline. Diagnose and propose a solution.' },
  { id: 'market_entry',    label: 'Market Entry',     context: 'Should the client enter the Canadian SMB lending market? How?' },
  { id: 'pricing',         label: 'Pricing Strategy', context: 'Credit card has 20% lower activation than industry. The $95 fee may be the issue.' },
  { id: 'growth',          label: 'Growth Strategy',  context: 'Auto finance grew 8% vs market 22%. Diagnose and propose a fix.' },
]

const PRACTICE_MODES = [
  { id: 'untimed', label: 'Untimed',        desc: 'No time pressure' },
  { id: 'timed',   label: 'Timed (2 min)',  desc: 'Gentle pressure per answer' },
  { id: 'drill',   label: 'Framework drill', desc: 'Structure first — no analysis yet' },
]

export default function App() {
  const [user, setUser]               = useState(null)
  const [isAdmin, setIsAdmin]         = useState(false)
  const [authLoading, setAuthLoading] = useState(true)
  const [hasSeenTest, setHasSeenTest] = useState(
    () => localStorage.getItem('casegym_sample_done') === 'true'
  )
  const [screen, setScreen]           = useState('mode')
  const [companies, setCompanies]     = useState([])
  const [selectedCompany, setSelectedCompany]   = useState(null)
  const [selectedCaseType, setSelectedCaseType] = useState(null)
  const [conversationMode, setConversationMode] = useState('candidate')
  const [role, setRole]                         = useState('analyst')
  const [practiceMode, setPracticeMode]         = useState('untimed')
  const [messages, setMessages]           = useState([])
  const [feedbackHistory, setFeedbackHistory] = useState([])
  const [currentFeedback, setCurrentFeedback] = useState(null)
  const [feedbackLoading, setFeedbackLoading] = useState(false)
  const [statusText, setStatusText]           = useState('')
  const [isConnected, setIsConnected]         = useState(false)
  const { isRecording, startRecording, stopRecording } = useAudioRecorder()
  const audioQueueRef = useRef([])
  const isPlayingRef  = useRef(false)
  const turnIndexRef  = useRef(0)

  useEffect(() => {
    return onAuthStateChanged(auth, async firebaseUser => {
      if (firebaseUser) {
        setUser(firebaseUser)
        try {
          const token = await firebaseUser.getIdToken()
          const res = await fetch('/api/auth/verify', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id_token: token })
          })
          const data = await res.json()
          setIsAdmin(data.is_admin || false)
        } catch (e) { console.error(e) }
      } else { setUser(null); setIsAdmin(false) }
      setAuthLoading(false)
    })
  }, [])

  useEffect(() => {
    if (user) fetch('/api/companies').then(r => r.json()).then(setCompanies).catch(console.error)
  }, [user])

  async function playAudioQueue() {
    if (isPlayingRef.current || !audioQueueRef.current.length) return
    isPlayingRef.current = true
    while (audioQueueRef.current.length) {
      const bytes = audioQueueRef.current.shift()
      const url   = URL.createObjectURL(new Blob([bytes], { type: 'audio/mpeg' }))
      const audio = new Audio(url)
      await new Promise(r => { audio.onended = r; audio.onerror = r; audio.play().catch(r) })
      URL.revokeObjectURL(url)
    }
    isPlayingRef.current = false
  }

  const handleWsMessage = useCallback(async data => {
    switch (data.type) {
      case 'interviewer_message':
      case 'candidate_message':
        setMessages(prev => [...prev, {
          role: 'assistant', text: data.text,
          speaker: data.type === 'candidate_message' ? 'AI Candidate' : 'Interviewer'
        }])
        setStatusText('')
        break
      case 'user_transcript':
        setMessages(prev => [...prev, { role: 'user', text: data.text }])
        break
      case 'status': setStatusText(data.text); break
      case 'turn_complete':
        const idx = turnIndexRef.current++
        setFeedbackLoading(true); setCurrentFeedback(null)
        try {
          const token = await getIdToken()
          const res = await fetch('/api/feedback', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              candidate_response: data.user_response,
              company_id:  selectedCompany?.id,
              case_context: selectedCaseType?.context || '',
              role, id_token: token
            })
          })
          const fb = await res.json()
          setCurrentFeedback(fb)
          setFeedbackHistory(prev => { const n = [...prev]; n[idx] = fb; return n })
        } catch (e) { console.error(e) }
        finally { setFeedbackLoading(false) }
        break
      case 'error': setStatusText(`Error: ${data.text}`); break
    }
  }, [selectedCompany, selectedCaseType, role])

  const handleWsBytes = useCallback(bytes => {
    audioQueueRef.current.push(bytes); playAudioQueue()
  }, [])

  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const wsUrl = `${proto}//${window.location.host}/ws/conversation`

  const { connect, sendJSON, sendBytes, disconnect } = useWebSocket(wsUrl, {
    onOpen: () => setIsConnected(true),
    onClose: () => setIsConnected(false),
    onMessage: handleWsMessage,
    onBytes: handleWsBytes
  })

  async function startInterview() {
    setMessages([]); setFeedbackHistory([]); setCurrentFeedback(null)
    turnIndexRef.current = 0
    setScreen('interview')
    const token = await getIdToken()
    const ws = connect()
    ws.onopen = () => {
      setIsConnected(true)
      sendJSON({ id_token: token, company_id: selectedCompany?.id,
        case_context: selectedCaseType?.context || '',
        practice_mode: practiceMode, role, conversation_mode: conversationMode })
    }
  }

  function endInterview() {
    disconnect(); setScreen('mode'); setMessages([])
    setCurrentFeedback(null); setIsConnected(false)
  }

  async function handleStopRecording() {
    const blob = await stopRecording()
    if (blob?.size > 0) { setStatusText('Sending...'); await sendBytes(blob) }
  }

  function doneTest() { localStorage.setItem('casegym_sample_done','true'); setHasSeenTest(true) }

  if (authLoading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
    </div>
  )
  if (!user) return <Login />
  if (!hasSeenTest) return <SampleTest onComplete={doneTest} onSkip={doneTest} />

  if (screen === 'mode') return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-8">
      <div className="max-w-lg w-full">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">CaseGym</h1>
            <p className="text-xs text-gray-400 mt-1">{user.email}</p>
          </div>
          <div className="flex gap-2">
            {isAdmin && (
              <button onClick={() => setScreen('admin')}
                className="text-xs bg-gray-900 text-white px-3 py-2 rounded-lg">Admin</button>
            )}
            <button onClick={logout} className="text-xs text-gray-400 px-3 py-2">Sign out</button>
          </div>
        </div>
        {companies.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-12">
            No companies available.{isAdmin && ' Go to Admin → train.py first.'}
          </p>
        ) : (
          <div className="space-y-3">
            {[
              { id: 'configure', label: 'Practice', desc: 'Live voice case interview with real-time feedback.', badge: 'bg-blue-100 text-blue-700' },
              { id: 'evaluate',  label: 'Evaluate',  desc: 'Paste a case. Get a VP-level solution rated on the rubric.', badge: 'bg-amber-100 text-amber-700' },
              { id: 'simulate',  label: 'Simulate',  desc: 'Watch AI play both roles at the top 1% level.', badge: 'bg-purple-100 text-purple-700' },
            ].map(m => (
              <button key={m.id} onClick={() => setScreen(m.id)}
                className="w-full text-left px-6 py-5 bg-white rounded-2xl border border-gray-200 hover:border-blue-300 hover:shadow-md transition-all group">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-semibold text-gray-900 group-hover:text-blue-600">{m.label}</span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${m.badge}`}>{m.id}</span>
                    </div>
                    <p className="text-xs text-gray-400">{m.desc}</p>
                  </div>
                  <span className="text-gray-300 group-hover:text-blue-400 ml-4">→</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )

  if (screen === 'configure') {
    const ready = selectedCompany && selectedCaseType && conversationMode && role && practiceMode
    return (
      <div className="min-h-screen bg-gray-50 p-6 overflow-y-auto">
        <div className="max-w-lg mx-auto">
          <button onClick={() => setScreen('mode')} className="text-xs text-gray-400 mb-6 block">← Back</button>
          <h2 className="text-lg font-semibold text-gray-900 mb-6">Configure your session</h2>
          <Sec title="Company">
            {companies.map(c => <Opt key={c.id} label={c.name} selected={selectedCompany?.id === c.id} onClick={() => setSelectedCompany(c)} />)}
          </Sec>
          <Sec title="Mode">
            {CONVERSATION_MODES.map(m => <Opt key={m.id} label={m.label} desc={m.desc} selected={conversationMode === m.id} onClick={() => setConversationMode(m.id)} />)}
          </Sec>
          <Sec title="Role interviewing for">
            {ROLES.map(r => <Opt key={r.id} label={r.label} desc={r.desc} selected={role === r.id} onClick={() => setRole(r.id)} />)}
          </Sec>
          <Sec title="Case type">
            {CASE_TYPES.map(c => <Opt key={c.id} label={c.label} selected={selectedCaseType?.id === c.id} onClick={() => setSelectedCaseType(c)} />)}
          </Sec>
          <Sec title="Practice mode">
            {PRACTICE_MODES.map(p => <Opt key={p.id} label={p.label} desc={p.desc} selected={practiceMode === p.id} onClick={() => setPracticeMode(p.id)} />)}
          </Sec>
          <button onClick={startInterview} disabled={!ready}
            className="w-full py-4 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-400 text-white text-sm font-semibold rounded-xl mt-2">
            Start Session
          </button>
        </div>
      </div>
    )
  }

  if (screen === 'interview') return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-6">
      <div className="flex items-center justify-between mb-4 px-1 flex-wrap gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-bold text-gray-900">CaseGym</span>
          {[selectedCompany?.name, selectedCaseType?.label, role].filter(Boolean).map(t => (
            <span key={t} className="text-xs bg-gray-100 text-gray-500 px-2 py-1 rounded-full capitalize">{t}</span>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <DownloadButton messages={messages} feedbackHistory={feedbackHistory}
            company={selectedCompany?.name || ''} role={role} caseLabel={selectedCaseType?.label || ''} />
          <button onClick={endInterview} className="text-xs text-gray-400 hover:text-gray-600">End session</button>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 h-[calc(100vh-80px)]">
        <ConversationPanel messages={messages} statusText={statusText}
          isRecording={isRecording} isConnected={isConnected}
          conversationMode={conversationMode}
          onStartRecording={startRecording} onStopRecording={handleStopRecording} />
        <FeedbackPanel feedback={currentFeedback} isLoading={feedbackLoading} />
      </div>
    </div>
  )

  if (screen === 'evaluate') return <EvaluatePanel onBack={() => setScreen('mode')} companies={companies} role={role} />
  if (screen === 'simulate') return <SimulatePanel onBack={() => setScreen('mode')} companies={companies} role={role} />
}

function Sec({ title, children }) {
  return (
    <div className="mb-5">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{title}</p>
      <div className="space-y-2">{children}</div>
    </div>
  )
}
function Opt({ label, desc, selected, onClick }) {
  return (
    <button onClick={onClick}
      className={`w-full text-left px-4 py-3 rounded-xl border transition-all ${
        selected ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-white hover:border-gray-300'
      }`}>
      <span className={`text-sm font-medium ${selected ? 'text-blue-700' : 'text-gray-700'}`}>{label}</span>
      {desc && <p className="text-xs text-gray-400 mt-0.5">{desc}</p>}
    </button>
  )
}