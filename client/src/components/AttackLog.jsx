//scrollable list of log entries with colored status dot
//entries: array of {t: 'ok' | 'noise' | 'bad' | 'done', msg: string}
//empty:   text shown when no entries
export default function AttackLog({ entries, empty = '// no events yet — press Start attack' }){
    return (
        <div className="log">
            {(!entries || entries.length === 0) && (
                <div className="log__empty mono">{empty}</div>
            )}
            {(entries ?? []).map((e, i) => (
                <div key={i} className={'log__row log__row--' + e.t}>
                    <span className="log__dot" />
                    <span className="mono">{e.msg}</span>
                </div>
            ))}
        </div>
    );
}
