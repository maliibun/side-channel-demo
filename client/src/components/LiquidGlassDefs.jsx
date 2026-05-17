//SVG <defs> block holding the liquid-glass displacement filter
//rendered once at the root - referenced by CSS via backdrop-filter: url(#liquid-glass)
export default function LiquidGlassDefs(){
    return (
        <svg width="0" height="0" style={{position: 'absolute'}} aria-hidden="true">
            <defs>
                <filter id="liquid-glass" x="-10%" y="-10%" width="120%" height="120%">
                    <feTurbulence type="fractalNoise" baseFrequency="0.008 0.012" numOctaves="2" seed="4" result="noise"/>
                    <feGaussianBlur in="noise" stdDeviation="2" result="softNoise"/>
                    <feDisplacementMap in="SourceGraphic" in2="softNoise" scale="14" xChannelSelector="R" yChannelSelector="G"/>
                </filter>
            </defs>
        </svg>
    );
}
