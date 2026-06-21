import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Link } from 'react-router-dom';
import { Loader2, Heart } from 'lucide-react';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';

export default function Register() {
  const [step, setStep] = useState('register');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleRegister = async (e) => {
    e.preventDefault();
    if (password !== confirm) { setError('Passwords do not match'); return; }
    setLoading(true); setError('');
    try {
      await base44.auth.register({ email, password });
      setStep('otp');
    } catch (err) { setError(err.message || 'Registration failed'); }
    setLoading(false);
  };

  const handleVerify = async (e) => {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      const res = await base44.auth.verifyOtp({ email, otpCode: otp });
      base44.auth.setToken(res.access_token);
      window.location.href = '/';
    } catch (err) { setError(err.message || 'Verification failed'); setLoading(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-background">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-3">
            <Heart className="h-6 w-6 text-primary" />
          </div>
          <h1 className="font-serif text-2xl">Create Account</h1>
        </div>
        {step === 'register' ? (
          <form onSubmit={handleRegister} className="space-y-4">
            {error && <p className="text-sm text-destructive text-center">{error}</p>}
            <div className="space-y-1.5"><Label>Email</Label><Input type="email" value={email} onChange={e => setEmail(e.target.value)} required /></div>
            <div className="space-y-1.5"><Label>Password</Label><Input type="password" value={password} onChange={e => setPassword(e.target.value)} required /></div>
            <div className="space-y-1.5"><Label>Confirm Password</Label><Input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} required /></div>
            <Button type="submit" className="w-full" disabled={loading}>{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Sign Up'}</Button>
            <Button type="button" variant="outline" className="w-full" onClick={() => base44.auth.loginWithProvider('google', '/')}>Continue with Google</Button>
          </form>
        ) : (
          <form onSubmit={handleVerify} className="space-y-4">
            <p className="text-sm text-muted-foreground text-center">Enter the code sent to {email}</p>
            {error && <p className="text-sm text-destructive text-center">{error}</p>}
            <div className="flex justify-center">
              <InputOTP maxLength={6} value={otp} onChange={setOtp}>
                <InputOTPGroup><InputOTPSlot index={0} /><InputOTPSlot index={1} /><InputOTPSlot index={2} /><InputOTPSlot index={3} /><InputOTPSlot index={4} /><InputOTPSlot index={5} /></InputOTPGroup>
              </InputOTP>
            </div>
            <Button type="submit" className="w-full" disabled={loading}>{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Verify'}</Button>
            <Button type="button" variant="ghost" className="w-full text-sm" onClick={() => base44.auth.resendOtp(email)}>Resend Code</Button>
          </form>
        )}
        <p className="text-center text-sm text-muted-foreground">Already have an account? <Link to="/login" className="text-primary hover:underline">Sign in</Link></p>
      </div>
    </div>
  );
}