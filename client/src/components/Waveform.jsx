//SVG line-plot for a single trace
//data:    array of sample values (any length)
//color:   stroke color
//leak:    optional {start, end, label} highlight window in sample-index space
//height:  CSS class swap - 'em' for taller ASCAD trace
//empty:   text shown when data is empty
export default function Waveform({
    data,
    color = 'rgba(26, 22, 18, 0.9)',
    leak = null,
    height: heightMode,
    empty = 'no data',
}){
    const W = data && data.length > 200 ? 700 : 400;
    const H = 160;

    if(!data || data.length === 0){
        return (
            <div className={'waveform' + (heightMode === 'em' ? ' waveform--em' : '')}>
                <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
                    <text x={W / 2} y={H / 2} fontSize="11" fill="rgba(26,22,18,0.35)"
                        textAnchor="middle" fontFamily="JetBrains Mono">{empty}</text>
                </svg>
            </div>
        );
    }

    //auto-scale Y to fit data in a 10..150 band (with 10px headroom for the leak label)
    let yMin = Infinity, yMax = -Infinity;
    for(const v of data){ if(v < yMin) yMin = v; if(v > yMax) yMax = v; }
    const yRange = (yMax - yMin) || 1;
    const yScale = v => H - 10 - ((v - yMin) / yRange) * (H - 30);
    const xScale = i => (i / Math.max(data.length - 1, 1)) * W;

    let path = `M${xScale(0).toFixed(2)},${yScale(data[0]).toFixed(2)}`;
    for(let i = 1; i < data.length; i++){
        path += ` L${xScale(i).toFixed(2)},${yScale(data[i]).toFixed(2)}`;
    }

    return (
        <div className={'waveform' + (heightMode === 'em' ? ' waveform--em' : '')}>
            <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
                <path d={path} stroke={color} strokeWidth="1.2" fill="none" />
                {leak && (
                    <>
                        <rect
                            x={xScale(leak.start)} y="14"
                            width={xScale(leak.end) - xScale(leak.start)} height={H - 28}
                            fill="rgba(225, 29, 72, 0.08)"
                            stroke="rgba(225, 29, 72, 0.6)"
                            strokeDasharray="3 3"
                        />
                        {leak.label && (
                            <text
                                x={xScale((leak.start + leak.end) / 2)} y="10"
                                fontSize="9" fill="rgba(26, 22, 18, 0.9)"
                                textAnchor="middle" fontFamily="JetBrains Mono"
                            >{leak.label}</text>
                        )}
                    </>
                )}
            </svg>
        </div>
    );
}
