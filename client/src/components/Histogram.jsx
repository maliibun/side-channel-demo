//CSS bar histogram matching the design's .histogram - one <div> per bar
//values:    array or typed-array of numbers
//peakIdx:   index to paint red (--peak)
//truthIdx:  index to paint green (--truth)
//yLabels:   ['top', 'mid', 'bottom'] strings for the y-axis column
//empty:     placeholder text when values is empty/missing
//formatTip: function v => string shown in the cell tooltip
export default function Histogram({
    values,
    peakIdx = -1,
    truthIdx = -1,
    yLabels,
    empty = 'No data',
    formatTip = v => String(v),
}){
    if(!values || values.length === 0){
        return (
            <div className="chart-row">
                {yLabels && (
                    <div className="yaxis mono">
                        {yLabels.map((l, i) => <span key={i}>{l}</span>)}
                    </div>
                )}
                <div className="histogram">
                    <div className="histogram__empty">{empty}</div>
                </div>
            </div>
        );
    }

    let min = Infinity, max = -Infinity;
    for(let i = 0; i < values.length; i++){
        const v = values[i];
        if(v < min) min = v;
        if(v > max) max = v;
    }
    const range = (max - min) || 1;

    return (
        <div className="chart-row">
            {yLabels && (
                <div className="yaxis mono">
                    {yLabels.map((l, i) => <span key={i}>{l}</span>)}
                </div>
            )}
            <div className="histogram">
                {Array.from(values).map((v, i) => {
                    const h = ((v - min) / range) * 100;
                    let cls = 'histogram__bar';
                    if(i === peakIdx) cls += ' histogram__bar--peak';
                    else if(i === truthIdx) cls += ' histogram__bar--truth';
                    return (
                        <div
                            key={i}
                            className={cls}
                            style={{height: Math.max(h, 1) + '%'}}
                            title={`0x${i.toString(16).padStart(2, '0').toUpperCase()}: ${formatTip(v)}`}
                        />
                    );
                })}
            </div>
        </div>
    );
}
