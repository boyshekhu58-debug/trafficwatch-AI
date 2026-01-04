import React from 'react';
import { Button } from '@/components/ui/button';
import { Shield, Video, AlertTriangle, Zap } from 'lucide-react';

const LandingPage = () => {
  const handleLogin = () => {
    const redirectUrl = `${window.location.origin}/dashboard`;
    window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* Hero Section */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-blue-600/10 via-slate-950 to-red-600/10"></div>
        
        <nav className="relative z-10 container mx-auto px-6 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Shield className="w-8 h-8 text-blue-500" />
              <span className="text-2xl font-bold tracking-tight">TrafficWatch AI</span>
            </div>
            <Button 
              data-testid="login-button"
              onClick={handleLogin}
              className="bg-blue-600 hover:bg-blue-700 text-white px-6"
            >
              Sign In with Google
            </Button>
          </div>
        </nav>

        <div className="relative z-10 container mx-auto px-6 py-20 text-center">
          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-extrabold mb-6 bg-gradient-to-r from-blue-400 via-white to-red-400 bg-clip-text text-transparent">
            Real-Time Traffic Violation Detection
          </h1>
          <p className="text-lg sm:text-xl text-slate-300 max-w-3xl mx-auto mb-10">
            <em className="italic">“Every frame we analyze is a chance to save a life.”</em>
            <span className="block mt-3">We don’t detect violations to punish people — we do it to protect them.</span>
          </p>
          <Button 
            data-testid="get-started-button"
            onClick={handleLogin}
            size="lg"
            className="bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 text-white px-8 py-6 text-lg rounded-full shadow-lg shadow-blue-500/50 transition-all duration-300 hover:scale-105"
          >
            Get Started Free
          </Button>
        </div>
      </div>

      {/* Features */}
      <div className="container mx-auto px-6 py-20">
        <h2 className="text-3xl sm:text-4xl font-bold text-center mb-16">Powerful Detection Features</h2>
        <div className="grid md:grid-cols-3 gap-8">
          <div className="bg-slate-900/50 backdrop-blur-sm border border-slate-800 rounded-2xl p-8 hover:border-blue-500/50 transition-all duration-300">
            <div className="bg-red-500/10 w-14 h-14 rounded-xl flex items-center justify-center mb-4">
              <AlertTriangle className="w-8 h-8 text-red-500" />
            </div>
            <h3 className="text-xl font-bold mb-3">No Helmet Detection</h3>
            <p className="text-slate-400">Automatically identify riders without helmets using advanced AI recognition.</p>
          </div>

          <div className="bg-slate-900/50 backdrop-blur-sm border border-slate-800 rounded-2xl p-8 hover:border-blue-500/50 transition-all duration-300">
            <div className="bg-yellow-500/10 w-14 h-14 rounded-xl flex items-center justify-center mb-4">
              <Zap className="w-8 h-8 text-yellow-500" />
            </div>
            <h3 className="text-xl font-bold mb-3">Overspeeding Detection</h3>
            <p className="text-slate-400">Track vehicle speeds with calibrated zones and flag violations instantly.</p>
          </div>

          <div className="bg-slate-900/50 backdrop-blur-sm border border-slate-800 rounded-2xl p-8 hover:border-blue-500/50 transition-all duration-300">
            <div className="bg-blue-500/10 w-14 h-14 rounded-xl flex items-center justify-center mb-4">
              <Video className="w-8 h-8 text-blue-500" />
            </div>
            <h3 className="text-xl font-bold mb-3">Video Processing</h3>
            <p className="text-slate-400">Upload videos and get annotated results with all violations marked.</p>
          </div>
        </div>
      </div>

      {/* CTA */}
      <div className="container mx-auto px-6 py-20 text-center">
        <div className="bg-gradient-to-r from-blue-600/20 to-red-600/20 border border-blue-500/30 rounded-3xl p-12">
          <h2 className="text-3xl sm:text-4xl font-bold mb-6">Start Detecting Violations Today</h2>
          <p className="text-slate-300 mb-8 max-w-2xl mx-auto">
            Join the future of traffic monitoring with AI-powered detection. Upload videos, calibrate zones, and track violations effortlessly.
          </p>
          <Button 
            data-testid="cta-get-started-button"
            onClick={handleLogin}
            size="lg"
            className="bg-white text-slate-950 hover:bg-slate-100 px-8 py-6 text-lg rounded-full font-semibold shadow-xl transition-all duration-300 hover:scale-105"
          >
            Get Started Now
          </Button>
        </div>
      </div>
    </div>
  );
};

export default LandingPage;
