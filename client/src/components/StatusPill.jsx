//small pill badge - kinds: neutral, ok, bad, live (animated dot)
export default function StatusPill({ kind = 'neutral', children }){
    return <span className={'pill pill--' + kind}>{children}</span>;
}
