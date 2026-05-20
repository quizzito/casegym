import { useRef, useCallback } from 'react'

export function useWebSocket(url, handlers) {
  const wsRef = useRef(null)

  const connect = useCallback(() => {
    const ws = new WebSocket(url)
    ws.binaryType = 'arraybuffer'
    ws.onopen    = () => handlers.onOpen?.()
    ws.onclose   = () => handlers.onClose?.()
    ws.onerror   = e => handlers.onError?.(e)
    ws.onmessage = event => {
      if (event.data instanceof ArrayBuffer) {
        handlers.onBytes?.(event.data)
      } else {
        try { handlers.onMessage?.(JSON.parse(event.data)) }
        catch (e) { console.error('WS parse error:', e) }
      }
    }
    wsRef.current = ws
    return ws
  }, [url, handlers])

  const sendJSON  = useCallback(data => {
    if (wsRef.current?.readyState === WebSocket.OPEN)
      wsRef.current.send(JSON.stringify(data))
  }, [])

  const sendBytes = useCallback(blob => {
    return new Promise(resolve => {
      const reader = new FileReader()
      reader.onload = () => {
        if (wsRef.current?.readyState === WebSocket.OPEN)
          wsRef.current.send(reader.result)
        resolve()
      }
      reader.readAsArrayBuffer(blob)
    })
  }, [])

  const disconnect = useCallback(() => wsRef.current?.close(), [])
  return { connect, sendJSON, sendBytes, disconnect }
}