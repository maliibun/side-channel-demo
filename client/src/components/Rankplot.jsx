//guessing-entropy plot - rank of the true key vs traces seen
//points:  array of {n, rank} (n = trace count, rank in [1, 256])
//maxN:    largest milestone (used for the x-axis upper bound)
//minN:    smallest milestone (anchors the left edge in log space)
//uses log2 x-scale so geometric milestones (50, 100, 200, 400, ...) space evenly
export default function Rankplot({ points, maxN = 2000, minN = 50, empty = 'no attack — press Run' }){
    const has = points && points.length > 0;

    const logSpan = Math.log2(maxN) - Math.log2(minN);
    const xScale = n => logSpan > 0
        ? 36 + ((Math.log2(Math.max(n, minN)) - Math.log2(minN)) / logSpan) * 350
        : 211;
    const yScale = r => 18 + (r / 256) * 122;

    let path = '';
    if(has){
        path = `M${xScale(points[0].n).toFixed(2)},${yScale(points[0].rank).toFixed(2)}`;
        for(let i = 1; i < points.length; i++){
            path += ` L${xScale(points[i].n).toFixed(2)},${yScale(points[i].rank).toFixed(2)}`;
        }
    }

    //x-axis tick positions: powers of 2 between minN and maxN, plus maxN itself
    const xTicks = [];
    for(let n = minN; n <= maxN; n *= 2) xTicks.push(n);
    if(xTicks[xTicks.length - 1] !== maxN) xTicks.push(maxN);

    return (
        <div className="rankplot">
            <svg viewBox="0 0 400 170" preserveAspectRatio="none">
                {/* y-axis grid + tick labels */}
                {[0, 64, 128, 192, 256].map(v => (
                    <g key={v}>
                        <line x1="36" y1={yScale(v)} x2="395" y2={yScale(v)}
                            stroke="rgba(26,22,18,0.07)" />
                        <text x="33" y={yScale(v) + 3} fontSize="8"
                            fill="rgba(26,22,18,0.55)" fontFamily="JetBrains Mono"
                            textAnchor="end">{v}</text>
                    </g>
                ))}

                {/* x-axis ticks at log positions */}
                {xTicks.map(n => (
                    <text key={n} x={xScale(n)} y="160" fontSize="7.5"
                        fill="rgba(26,22,18,0.5)" fontFamily="JetBrains Mono"
                        textAnchor="middle">{n}</text>
                ))}

                {/* rank = 1 target line */}
                <line x1="36" y1={yScale(1)} x2="395" y2={yScale(1)}
                    stroke="rgba(225, 29, 72, 0.7)" strokeDasharray="3 3" strokeWidth="1.2" />

                {/* axis titles */}
                <text x="215" y="170" fontSize="9" fill="rgba(26,22,18,0.6)"
                    fontFamily="JetBrains Mono" textAnchor="middle">traces (log scale)</text>
                <text x="-80" y="10" fontSize="9" fill="rgba(26,22,18,0.6)"
                    fontFamily="JetBrains Mono" textAnchor="middle"
                    transform="rotate(-90)">rank of true key</text>

                {/* connecting line */}
                {has && <path d={path} stroke="rgba(26, 22, 18, 0.85)" strokeWidth="1.8" fill="none" />}

                {/* dots + rank labels at each milestone */}
                {has && points.map((p, i) => (
                    <g key={i}>
                        <circle
                            cx={xScale(p.n)} cy={yScale(p.rank)} r="3.5"
                            fill={p.rank === 1 ? '#e11d48' : '#fff'}
                            stroke="rgba(26, 22, 18, 0.85)" strokeWidth="0.75"
                        />
                        <text
                            x={xScale(p.n)} y={yScale(p.rank) - 8}
                            fontSize="8.5" fill="rgba(26,22,18,0.85)"
                            fontFamily="JetBrains Mono" textAnchor="middle"
                        >#{p.rank}</text>
                    </g>
                ))}

                {!has && (
                    <text x="200" y="90" fontSize="11" fill="rgba(26,22,18,0.35)"
                        textAnchor="middle" fontFamily="JetBrains Mono">{empty}</text>
                )}
            </svg>
        </div>
    );
}
