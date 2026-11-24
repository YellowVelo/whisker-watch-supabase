import { useState, useRef, useEffect } from 'react';
import { invokeAI, buildChatHistory, MAX_QUESTION_CHARS } from '@/api/aiClient';
import { Send, Stethoscope } from 'lucide-react';
import { detectEmergencyKeywords, aiErrorText } from '@/lib/aiGuardrails';
import AIEmergencyNotice from './AIEmergencyNotice';
import AIErrorNotice from './AIErrorNotice';

// General-mode Ask Wysker chat (spec 0023 step 5) — used when the sheet is
// opened with no specific pet in context (e.g. from Home). A small,
// additive sibling to PetAIChat.jsx rather than a modification of it: same
// invokeAI()/Edge Function, just the household-wide task instead of a
// single pet's. Spec 0080: the server looks up the household's pets itself
// (owned and co-owned only, spec 0079), so no pet details are sent from here.
export default function GeneralAskWyskerChat() {
  const [messages, setMessages] = useState([
    { role: 'assistant', content: "Hi! I'm here to help with questions about your pets. What would you like to know?" },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;
    const userMsg = { role: 'user', content: text };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');

    // Hard stop, per product decision: an emergency keyword match ends this
    // turn immediately, before any AI call — no bypass. Call your vet,
    // don't ask Wysker Watch.
    if (detectEmergencyKeywords(text)) {
      setMessages((prev) => [...prev, { role: 'assistant', emergency: true }]);
      return;
    }

    setLoading(true);

    // The conversation before this question, without the question itself.
    const history = buildChatHistory(messages);

    try {
      const result = await invokeAI({
        task: 'household_chat',
        question: text,
        history,
      });

      // Backstop: the AI flagged this as urgent even though the keyword list
      // didn't catch it — its own answer is discarded, same as PetAIChat.
      if (result?.urgent) {
        setMessages((prev) => [...prev, { role: 'assistant', emergency: true }]);
      } else {
        setMessages((prev) => [...prev, { role: 'assistant', content: result?.reply || '' }]);
      }
    } catch (err) {
      // Covers both the new rate limit (spec 0050) and any other AI
      // failure — without this, the loading state below never resolved
      // and the chat just hung forever with no explanation.
      setMessages((prev) => [...prev, { role: 'assistant', error: aiErrorText(err) }]);
    } finally {
      setLoading(false);
    }
  };

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  };

  return (
    <div className="flex flex-col h-[480px]">
      <div className="flex-1 overflow-y-auto space-y-3 pb-2">
        {messages.map((msg, i) => (
          msg.emergency ? (
            <AIEmergencyNotice key={i} />
          ) : msg.error ? (
            <AIErrorNotice key={i} message={msg.error} />
          ) : (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              {msg.role === 'assistant' && (
                <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center mr-2 mt-0.5 shrink-0"><Stethoscope className="h-3.5 w-3.5 text-primary" /></div>
              )}
              <div className={`max-w-[82%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-primary text-primary-foreground rounded-br-sm'
                  : 'bg-muted text-foreground rounded-bl-sm'
              }`}>
                {msg.content}
              </div>
            </div>
          )
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center mr-2 mt-0.5 shrink-0"><Stethoscope className="h-3.5 w-3.5 text-primary" /></div>
            <div className="bg-muted rounded-2xl rounded-bl-sm px-4 py-3">
              <div className="flex gap-1">
                <div className="w-2 h-2 bg-muted-foreground/40 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-2 h-2 bg-muted-foreground/40 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-2 h-2 bg-muted-foreground/40 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="pt-3 border-t border-border flex gap-2 items-end">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKey}
          placeholder="Ask about any of your pets…"
          rows={1}
          maxLength={MAX_QUESTION_CHARS}
          className="flex-1 resize-none rounded-xl border border-input bg-background px-3 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring placeholder:text-muted-foreground min-h-[42px] max-h-24"
          style={{ WebkitUserSelect: 'text', userSelect: 'text' }}
        />
        <button
          onClick={send}
          disabled={!input.trim() || loading}
          className="h-10 w-10 rounded-xl bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-40 transition-opacity shrink-0 min-h-0"
        >
          <Send className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
