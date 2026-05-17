//8x2 grid of byte cells, used by the timing attack to show recovered bytes
//recovered: Uint8Array (length 0..16)
//truth:     hex string of the secret (32 chars) for ok/bad coloring, or null
//currentIdx: optional - position currently being attacked (pulses)
export default function KeyGrid({ recovered, truth, currentIdx }){
    const cells = Array.from({length: 16}, (_, i) => i);
    return (
        <div className="keygrid">
            {cells.map(i => {
                let cls = 'keygrid__cell';
                let val = '--';
                if(i < recovered.length){
                    val = recovered[i].toString(16).padStart(2, '0').toUpperCase();
                    if(truth){
                        const truthByte = parseInt(truth.slice(i * 2, i * 2 + 2), 16);
                        cls += recovered[i] === truthByte ? ' keygrid__cell--ok' : ' keygrid__cell--bad';
                    } else {
                        cls += ' keygrid__cell--ok';
                    }
                }
                if(i === currentIdx) cls += ' keygrid__cell--current';
                return (
                    <div key={i} className={cls}>
                        <span className="keygrid__pos">{i.toString(16).toUpperCase()}</span>
                        <span className="keygrid__val">{val}</span>
                    </div>
                );
            })}
        </div>
    );
}
