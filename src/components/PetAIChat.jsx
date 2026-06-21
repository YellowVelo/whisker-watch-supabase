import { useState, useRef, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Send } from 'lucide-react';

const SYSTEM_CONTEXT = (pet, medications) => {
  const conditions = pet.conditions?.join(', ') || 'None noted';
  const activeMeds = medications?.filter(m => m.active).map(m => `${m.name} ${m.dosage || ''} ${m.frequency || ''}`).join(', ') || 'None';
  const age = pet.birth_date ? Math.floor((new Date() - new Date(pet.birth_date)) / (365.25 * 24 * 60 * 60 * 1000)) : null;
  return `You are a compassionate, experienced veterinarian with 20+ years of clinical practice. You are assisting the owner of a pet named ${pet.name}, a ${age ? age + '-year-old ' : ''}${pet.species || 'cat'} (${pet.breed || 'mixed breed'}) with the following known conditions: ${conditions}. Active medications: ${activeMeds}. Answer questions clearly and practically. Always recommend consulting a licensed veterinarian for diagnosis, prescriptions, or emergencies. Keep responses concise and friendly.`;
};

export default function PetAIChat({ pet, medications }) {
  const [messages, setMessages] = useState([
    { role: 'assistant', content: `Hi! I'm here to help with questions about ${pet.name}. I have their profile on file — what would you like to know?` }
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
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    // Build conversation history for context
    const history = [...messages, userMsg].map(m => `${m.role === 'user' ? 'Owner' : 'Vet Assistant'}: ${m.content}`).join('\n\n');

    const reply = await base44.integrations.Core.InvokeLLM({
      prompt: `${SYSTEM_CONTEXT(pet, medications)}\n\nConversation so far:\n${history}\n\nOwner's latest question: ${text}\n\nVet Assistant:`,
    });

    setMessages(prev => [...prev, { role: 'assistant', content: reply }]);
    setLoading(false);
  };

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  };

  return (
    <div className="flex flex-col h-[480px]">
      <div className="flex-1 overflow-y-auto space-y-3 pb-2">
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {msg.role === 'assistant' && (
              <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center mr-2 mt-0.5 shrink-0 text-sm">🩺</div>
            )}
            <div className={`max-w-[82%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
              msg.role === 'user'
                ? 'bg-primary text-primary-foreground rounded-br-sm'
                : 'bg-muted text-foreground rounded-bl-sm'
            }`}>
              {msg.content}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center mr-2 mt-0.5 shrink-0 text-sm">🩺</div>
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
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKey}
          placeholder={`Ask about ${pet.name}…`}
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