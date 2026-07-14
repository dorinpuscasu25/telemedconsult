import React from 'react';
import { Link } from 'react-router-dom';
import { Activity, Users, Stethoscope, HeartPulse } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { motion } from 'framer-motion';
export function GuestPage() {
  return (
    <div className="min-h-screen gradient-bg flex flex-col relative overflow-hidden">
      {/* Decorative background elements */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-primary/10 blur-[100px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-purple-500/10 blur-[100px] pointer-events-none" />

      {/* Top Bar with Counters */}
      <div className="glass-panel border-b border-white/20 py-3 px-4 text-sm font-medium z-10">
        <div className="max-w-7xl mx-auto flex flex-wrap justify-center gap-6 md:gap-12">
          <motion.div
            initial={{
              opacity: 0,
              y: -10
            }}
            animate={{
              opacity: 1,
              y: 0
            }}
            transition={{
              delay: 0.1
            }}
            className="flex items-center text-slate-700">
            
            <HeartPulse className="h-4 w-4 mr-2 text-primary" />
            <span>
              Consultații oferite:{' '}
              <strong className="text-primary ml-1">1,245</strong>
            </span>
          </motion.div>
          <motion.div
            initial={{
              opacity: 0,
              y: -10
            }}
            animate={{
              opacity: 1,
              y: 0
            }}
            transition={{
              delay: 0.2
            }}
            className="flex items-center text-slate-700">
            
            <Users className="h-4 w-4 mr-2 text-purple-500" />
            <span>
              Chemări operator:{' '}
              <strong className="text-purple-500 ml-1">856</strong>
            </span>
          </motion.div>
          <motion.div
            initial={{
              opacity: 0,
              y: -10
            }}
            animate={{
              opacity: 1,
              y: 0
            }}
            transition={{
              delay: 0.3
            }}
            className="hidden md:flex items-center text-slate-700">
            
            <Stethoscope className="h-4 w-4 mr-2 text-pink-500" />
            <span>
              Medici activi: <strong className="text-pink-500 ml-1">42</strong>
            </span>
          </motion.div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex items-center justify-center p-4 z-10">
        <motion.div
          initial={{
            opacity: 0,
            scale: 0.95
          }}
          animate={{
            opacity: 1,
            scale: 1
          }}
          transition={{
            duration: 0.5
          }}
          className="w-full max-w-md">
          
          <Card className="glass-card border-0 shadow-2xl">
            <CardContent className="pt-12 pb-10 px-8 flex flex-col items-center text-center">
              <div className="h-24 w-24 rounded-2xl bg-gradient-to-br from-primary to-purple-600 flex items-center justify-center mb-8 shadow-xl shadow-primary/30 transform rotate-3 hover:rotate-0 transition-transform duration-300">
                <Activity className="h-12 w-12 text-white" />
              </div>

              <h1 className="text-3xl font-extrabold text-slate-900 mb-3 tracking-tight sm:text-4xl">
                telemedconsult<span className="text-primary">.md</span>
              </h1>
              <p className="text-slate-500 mb-10 text-lg leading-relaxed">
                Platforma ta de telemedicină pentru consultații rapide, sigure
                și eficiente.
              </p>

              <div className="w-full space-y-4">
                <Button
                  asChild
                  className="w-full text-lg h-14 rounded-xl bg-gradient-to-r from-primary to-purple-600 hover:from-primary/90 hover:to-purple-600/90 shadow-lg shadow-primary/25 border-0"
                  size="lg">
                  
                  <Link to="/login">Intră în cont</Link>
                </Button>
                <Button
                  asChild
                  variant="outline"
                  className="w-full text-lg h-14 rounded-xl border-2 border-slate-200 hover:bg-slate-50/50 bg-white/50 backdrop-blur-sm"
                  size="lg">
                  
                  <Link to="/register">Creează cont nou</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Footer */}
      <footer className="glass-panel border-t border-white/20 py-6 text-center text-slate-500 text-sm z-10">
        <p>
          © {new Date().getFullYear()} telemedconsult.md. Toate drepturile rezervate.
        </p>
      </footer>
    </div>);

}
