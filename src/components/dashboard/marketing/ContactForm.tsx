import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Send, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface ContactFormProps {
  address: string;
  agentName: string;
}

const COOLDOWN_MS = 60_000; // 1 minute between submissions

const ContactForm = ({ address, agentName }: ContactFormProps) => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    message: `I'm interested in the property at ${address}. Please send me more information.`,
  });
  const [honeypot, setHoneypot] = useState('');
  const [isSending, setIsSending] = useState(false);
  const lastSubmitRef = useRef<number>(0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Honeypot check
    if (honeypot) return;

    // Rate limit
    const now = Date.now();
    if (now - lastSubmitRef.current < COOLDOWN_MS) {
      toast.error('Please wait a minute before sending another inquiry.');
      return;
    }

    // Basic validation
    const name = formData.name.trim();
    const email = formData.email.trim();
    const message = formData.message.trim();

    if (!name || name.length > 100) {
      toast.error('Please enter a valid name (max 100 characters).');
      return;
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 255) {
      toast.error('Please enter a valid email address.');
      return;
    }
    if (!message || message.length > 2000) {
      toast.error('Please enter a message (max 2000 characters).');
      return;
    }
    if (formData.phone && formData.phone.length > 30) {
      toast.error('Please enter a valid phone number.');
      return;
    }

    setIsSending(true);
    lastSubmitRef.current = now;

    try {
      const { error } = await supabase.functions.invoke('send-contact-inquiry', {
        body: {
          name,
          email,
          phone: formData.phone.trim(),
          message,
          address,
          agentName,
        },
      });

      if (error) throw error;

      toast.success("Your inquiry has been sent! We'll be in touch soon.");
      setFormData({ name: '', email: '', phone: '', message: '' });
    } catch (error) {
      console.error('Error sending inquiry:', error);
      toast.error('Failed to send inquiry. Please try again or call us directly.');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Honeypot - hidden from real users */}
      <div className="absolute opacity-0 -z-10 h-0 overflow-hidden" aria-hidden="true" tabIndex={-1}>
        <label htmlFor="contact-website">Website</label>
        <input
          id="contact-website"
          type="text"
          value={honeypot}
          onChange={(e) => setHoneypot(e.target.value)}
          autoComplete="off"
          tabIndex={-1}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="contact-name">Full Name</Label>
        <Input
          id="contact-name"
          value={formData.name}
          onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
          placeholder="Your full name"
          maxLength={100}
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="contact-email">Email</Label>
        <Input
          id="contact-email"
          type="email"
          value={formData.email}
          onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
          placeholder="your@email.com"
          maxLength={255}
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="contact-phone">Phone</Label>
        <Input
          id="contact-phone"
          type="tel"
          value={formData.phone}
          onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
          placeholder="(614) 555-0000"
          maxLength={30}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="contact-message">Message</Label>
        <Textarea
          id="contact-message"
          value={formData.message}
          onChange={(e) => setFormData(prev => ({ ...prev, message: e.target.value }))}
          rows={4}
          maxLength={2000}
        />
      </div>
      <Button type="submit" className="w-full" disabled={isSending}>
        {isSending ? (
          <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Sending...</>
        ) : (
          <><Send className="w-4 h-4 mr-2" /> Send Inquiry to {agentName}</>
        )}
      </Button>
    </form>
  );
};

export default ContactForm;
