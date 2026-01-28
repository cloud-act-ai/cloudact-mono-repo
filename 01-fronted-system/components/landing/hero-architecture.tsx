"use client"

import { motion } from "framer-motion"
// Note: Icons reserved for future use - Cloud, Database, LayoutGrid, Lock, Server, Share2, Shield, Zap

export function HeroArchitecture() {
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: { 
      opacity: 1,
      transition: { 
        staggerChildren: 0.1,
        delayChildren: 0.3
      }
    }
  }

  const itemVariants = {
    hidden: { scale: 0, opacity: 0 },
    visible: {
      scale: 1,
      opacity: 1,
      transition: { type: "spring" as const, stiffness: 260, damping: 20 }
    }
  }

  const lineVariants = {
    hidden: { pathLength: 0, opacity: 0 },
    visible: {
      pathLength: 1,
      opacity: 0.3,
      transition: { duration: 1.5, ease: "easeInOut" as const, delay: 1 }
    }
  }

  return (
    <div className="relative w-full h-[400px] md:h-[500px] flex items-center justify-center overflow-hidden">
      {/* Central CloudAct Core */}
      <motion.div 
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="relative z-10"
      >
        <motion.div 
          variants={itemVariants}
          className="w-32 h-32 md:w-40 md:h-40 bg-white dark:bg-zinc-900 rounded-3xl shadow-2xl border border-zinc-200 dark:border-zinc-800 flex flex-col items-center justify-center relative z-20"
        >
          <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/20 to-blue-500/20 rounded-3xl blur-xl" />
          <div className="relative z-10 bg-white dark:bg-black p-4 rounded-2xl shadow-inner">
             <img src="/logos/cloudact-logo-black.svg" alt="CloudAct.ai" className="h-8 w-auto dark:invert" />
          </div>
          <p className="mt-3 text-xs font-semibold text-zinc-500 font-mono">CORE ENGINE</p>
        </motion.div>

        {/* Orbiting Nodes */}
        {/* Top - AWS */}
        <motion.div 
          variants={itemVariants}
          className="absolute -top-24 left-1/2 -translate-x-1/2 w-16 h-16 bg-white rounded-2xl shadow-lg border border-orange-100 flex items-center justify-center"
        >
          <img src="/logos/providers/aws.svg" alt="AWS" className="w-8 h-8" />
        </motion.div>

        {/* Right - Azure */}
        <motion.div 
          variants={itemVariants}
          className="absolute top-1/2 -right-32 -translate-y-1/2 w-16 h-16 bg-white rounded-2xl shadow-lg border border-blue-100 flex items-center justify-center"
        >
          <img src="/logos/providers/azure.svg" alt="Azure" className="w-8 h-8" />
        </motion.div>

        {/* Bottom - GCP */}
        <motion.div 
          variants={itemVariants}
          className="absolute -bottom-24 left-1/2 -translate-x-1/2 w-16 h-16 bg-white rounded-2xl shadow-lg border border-red-100 flex items-center justify-center"
        >
          <img src="/logos/providers/gcp.svg" alt="GCP" className="w-8 h-8" />
        </motion.div>

         {/* Left - GenAI */}
        <motion.div 
          variants={itemVariants}
          className="absolute top-1/2 -left-32 -translate-y-1/2 w-16 h-16 bg-white rounded-2xl shadow-lg border border-purple-100 flex items-center justify-center"
        >
          <img src="/logos/providers/openai.svg" alt="OpenAI" className="w-8 h-8" />
        </motion.div>
      </motion.div>

      {/* Connection Lines (SVG) */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none z-0">
         <motion.path 
            d="M 50% 50% L 50% 20%" 
            stroke="url(#gradient-line)" 
            strokeWidth="2" 
            variants={lineVariants}
            initial="hidden"
            animate="visible"
         />
         <motion.path 
            d="M 50% 50% L 80% 50%" 
            stroke="url(#gradient-line)" 
            strokeWidth="2" 
            variants={lineVariants}
            initial="hidden"
            animate="visible"
         />
         <motion.path 
            d="M 50% 50% L 50% 80%" 
            stroke="url(#gradient-line)" 
            strokeWidth="2" 
            variants={lineVariants}
            initial="hidden"
            animate="visible"
         />
         <motion.path 
            d="M 50% 50% L 20% 50%" 
            stroke="url(#gradient-line)" 
            strokeWidth="2" 
            variants={lineVariants}
            initial="hidden"
            animate="visible"
         />
         
         <defs>
           <linearGradient id="gradient-line" x1="0%" y1="0%" x2="100%" y2="100%">
             <stop offset="0%" stopColor="#10B981" stopOpacity="0" />
             <stop offset="50%" stopColor="#10B981" stopOpacity="0.5" />
             <stop offset="100%" stopColor="#10B981" stopOpacity="0" />
           </linearGradient>
         </defs>
      </svg>
      
      {/* Floating Particles */}
      <div className="absolute inset-0 pointer-events-none">
        {[...Array(5)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute bg-emerald-400/30 rounded-full w-2 h-2"
            initial={{ 
              x: Math.random() * 400 - 200, 
              y: Math.random() * 400 - 200,
              opacity: 0 
            }}
            animate={{ 
              y: [null, Math.random() * -100],
              opacity: [0, 1, 0]
            }}
            transition={{
              duration: Math.random() * 3 + 2,
              repeat: Infinity,
              ease: "linear",
              delay: Math.random() * 2
            }}
            style={{
              left: "50%",
              top: "50%"
            }}
          />
        ))}
      </div>
    </div>
  )
}
