import { useState, useRef, useEffect } from 'react';
import { invokeAI } from '@/api/aiClient';
import { Send, Stethoscope } from 'lucide-react';
import { detectEmergencyKeywords, AI_DISCLAIMER_SENTENCE, URGENT_FLAG_INSTRUCTION } from '@/lib/aiGuardrails';
import AIEmergencyNotice from './AIEmergencyNotice';

// General-mode Ask Wysker chat (spec 0023 step 5) — used when the sheet is
// opened with no specific pet in context (e.g. from Home). A small,
// additive sibling to PetAIChat.jsx rather than a modification of it: same
// invokeAI()/Edge Function, just a household-wide system prompt instead of
// a single hardcoded pet.
const SYSTEM_CONTEXT = (pets) => {
  const petList = pets?.length
    ? pets.map((p) => `${p.name} (${p.species || 'pet'}${p.breed ? ', ' + p.breed : ''}${p.conditions?.length ? ', conditions: ' + p.conditions.join(', ') : ''})`).join('; ')
    : 'no pets on file yet';
  return `You are a compassionate, experienced veterinarian with 20+ years of clinical practice. You are assisting a pet owner whose household includes: ${petList}. The owner may ask about any one of these pets by name, or ask a general question. If it's unclear which pet a question concerns and the answer would differ by pet, ask them to clarify which pet they mean before answering. Answer questions clearly and practically. ${AI_DISCLAIMER_SENTENCE} ${URGENT_FLAG_INSTRUCTION}`;
};

export default function GeneralAskWyskerChat({ pets }) {
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

    const history = [...messages, userMsg].map((m) => `${m.role === 'user' ? 'Owner' : 'Vet Assistant'}: ${m.content}`).join('\n\n');

    const result = await invokeAI({
      prompt: `${SYSTEM_CONTEXT(pets)}\n\nConversation so far:\n${history}\n\nOwner's latest question: ${text}\n\nVet Assistant:`,
      response_json_schema: {
        type: 'object',
        properties: {
          reply: { type: 'string' },
          urgent: { type: 'boolean' },
        },
      },
    });

    // Backstop: the AI flagged this as urgent even though the keyword list
    // didn't catch it — its own answer is discarded, same as PetAIChat.
    if (result?.urgent) {
      setMessages((prev) => [...prev, { role: 'assistant', emergency: true }]);
    } else {
      setMessages((prev) => [...prev, { role: 'assistant', content: result?.reply || '' }]);
    }
    setLoading(false);
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
