"use client"

import React, { useState, useCallback, useEffect } from 'react'
import useEmblaCarousel from 'embla-carousel-react'
import { ArrowRight, ChevronLeft, ChevronRight, Play, Zap, TrendingDown, Shield } from 'lucide-react'
import Link from 'next/link'
import "../premium.css"

const HERO_SLIDES = [
  {
    id: 1,
    title: "The Modern FinOps Platform for GenAI, Cloud & SaaS",
    subtitle: "Multi-cloud and enterprise-ready. Give Finance and Engineering a shared system of record to align on budgets, act on insights, and scale with control.",
    ctaPrimary: "Start Free Trial",
    ctaPrimaryLink: "/signup",
    ctaSecondary: "Book a Demo",
    ctaSecondaryLink: "/demo",
    badge: "New Release 2.0",
    color: "mint"
  },
  {
    id: 2,
    title: "Stop Overspending on Large Language Models",
    subtitle: "Get token-level visibility into OpenAI, Anthropic, and custom model signals. Identify waste and optimize your AI infrastructure costs immediately.",
    ctaPrimary: "Analyze AI Costs",
    ctaPrimaryLink: "/features#genai",
    ctaSecondary: "View Documentation",
    ctaSecondaryLink: "/docs/genai",
    badge: "AI Cost Intelligence",
    color: "coral"
  },
  {
    id: 3,
    title: "Unify Your Entire Financial Stack",
    subtitle: "Connect AWS, Azure, GCP, and 50+ SaaS tools in one place. Automate cost allocation and get a single source of truth for all your technology spending.",
    ctaPrimary: "View Integrations",
    ctaPrimaryLink: "/integrations",
    ctaSecondary: "How It Works",
    ctaSecondaryLink: "/how-it-works",
    badge: "50+ Integrations",
    color: "blue"
  }
]

export function HeroSlider() {
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: true, duration: 30 })
  const [selectedIndex, setSelectedIndex] = useState(0)

  const scrollPrev = useCallback(() => emblaApi && emblaApi.scrollPrev(), [emblaApi])
  const scrollNext = useCallback(() => emblaApi && emblaApi.scrollNext(), [emblaApi])
  
  const onSelect = useCallback((api: any) => {
    setSelectedIndex(api.selectedScrollSnap())
  }, [])

  useEffect(() => {
    if (!emblaApi) return
    onSelect(emblaApi)
    emblaApi.on('select', onSelect)
    
    // Auto-play
    const autoplay = setInterval(() => {
      if (emblaApi.canScrollNext()) {
        emblaApi.scrollNext()
      } else {
        emblaApi.scrollTo(0)
      }
    }, 6000)

    return () => {
      clearInterval(autoplay)
      if (emblaApi) emblaApi.off('select', onSelect)
    }
  }, [emblaApi, onSelect])

  return (
    <section className="ca-hero-slider-section">
      <div className="ca-hero-bg-gradient" />
      
      <div className="ca-slider-viewport" ref={emblaRef}>
        <div className="ca-slider-container">
          {HERO_SLIDES.map((slide, index) => (
            <div className="ca-slide" key={slide.id}>
              <div className="ca-slide-content">
                <div className="ca-slide-badge">
                   <span className={`ca-badge-dot ca-badge-dot-${slide.color}`}></span>
                   {slide.badge}
                </div>
                
                <h1 className="ca-hero-headline">
                  {slide.title.split(/(GenAI, Cloud & SaaS|GenAI|Cloud|SaaS)/g).map((part, i) => {
                    if (part === 'GenAI, Cloud & SaaS') return <span key={i} className="ca-hero-highlight-unified">GenAI, Cloud & SaaS</span>
                    if (part === 'GenAI') return <span key={i} className="ca-hero-highlight">GenAI</span>
                    if (part === 'Cloud') return <span key={i} className="ca-hero-highlight">Cloud</span>
                    if (part === 'SaaS') return <span key={i} className="ca-hero-highlight">SaaS</span>
                    return part
                  })}
                </h1>
                
                <p className="ca-hero-subheadline">{slide.subtitle}</p>
                
                <div className="ca-hero-cta-group">
                  <Link href={slide.ctaPrimaryLink} className="ca-btn-hero-primary">
                    {slide.ctaPrimary}
                    <ArrowRight className="w-5 h-5" aria-hidden="true" />
                  </Link>
                  <Link href={slide.ctaSecondaryLink} className="ca-btn-hero-secondary">
                    {slide.id === 1 ? <Play className="w-5 h-5" aria-hidden="true" /> : <Zap className="w-4 h-4" />}
                    {slide.ctaSecondary}
                  </Link>
                </div>

                <div className="ca-hero-trust-row">
                   <div className="ca-hero-trust-item">
                      <Zap className="w-4 h-4 ca-icon-coral" aria-hidden="true" />
                      <span>5-min setup</span>
                   </div>
                   <div className="ca-hero-trust-divider" />
                   <div className="ca-hero-trust-item">
                      <TrendingDown className="w-4 h-4 ca-icon-mint" aria-hidden="true" />
                      <span>20%+ avg savings</span>
                   </div>
                   <div className="ca-hero-trust-divider" />
                   <div className="ca-hero-trust-item">
                      <Shield className="w-4 h-4 ca-icon-blue" aria-hidden="true" />
                      <span>SOC2 Compliant</span>
                   </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="ca-slider-controls">
         {/* Arrows removed for cleaner Enterprise look */}
         
         <div className="ca-slider-dots">
            {HERO_SLIDES.map((_, index) => (
               <button
                 key={index}
                 className={`ca-slider-dot ${index === selectedIndex ? 'is-active' : ''}`}
                 onClick={() => emblaApi && emblaApi.scrollTo(index)}
                 aria-label={`Go to slide ${index + 1}`}
               />
            ))}
         </div>
      </div>
    </section>
  )
}
