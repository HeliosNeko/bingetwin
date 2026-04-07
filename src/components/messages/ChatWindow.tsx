'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Send, ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import type { Message, Profile } from '@/types'

interface Props {
  matchId: string
  currentUserId: string
  partner: Profile
  initialMessages: Message[]
}

export default function ChatWindow({ matchId, currentUserId, partner, initialMessages }: Props) {
  const [messages, setMessages] = useState<Message[]>(initialMessages)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const supabase = createClient()

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    const channel = supabase
      .channel(`messages:${matchId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `match_id=eq.${matchId}` },
        payload => {
          setMessages(prev => [...prev, payload.new as Message])
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [matchId, supabase])

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault()
    if (!input.trim() || sending) return
    setSending(true)

    const content = input.trim()
    setInput('')

    await supabase.from('messages').insert({
      match_id: matchId,
      sender_id: currentUserId,
      content,
    })

    setSending(false)
  }

  return (
    <div className="flex flex-col h-screen md:h-[calc(100vh-0px)]">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 bg-gray-900 border-b border-gray-800 flex-shrink-0">
        <Link href="/messages" className="text-gray-400 hover:text-white">
          <ArrowLeft size={20} />
        </Link>
        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-violet-600 to-pink-600 flex items-center justify-center font-bold">
          {partner?.username?.[0]?.toUpperCase()}
        </div>
        <div>
          <p className="font-semibold text-sm">@{partner?.username}</p>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.map(msg => (
          <div
            key={msg.id}
            className={cn('flex', msg.sender_id === currentUserId ? 'justify-end' : 'justify-start')}
          >
            <div
              className={cn(
                'max-w-xs md:max-w-md px-4 py-2.5 rounded-2xl text-sm',
                msg.sender_id === currentUserId
                  ? 'bg-violet-600 rounded-br-sm'
                  : 'bg-gray-800 rounded-bl-sm'
              )}
            >
              {msg.content}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <form onSubmit={sendMessage} className="flex items-center gap-2 p-4 border-t border-gray-800 bg-gray-900">
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Votre message..."
          className="flex-1 bg-gray-800 border border-gray-700 rounded-full px-4 py-2.5 text-sm focus:outline-none focus:border-violet-500 transition-colors"
        />
        <button
          type="submit"
          disabled={!input.trim() || sending}
          className="w-10 h-10 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 rounded-full flex items-center justify-center transition-colors"
        >
          <Send size={16} />
        </button>
      </form>
    </div>
  )
}
