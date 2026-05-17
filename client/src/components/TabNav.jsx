import { Fragment } from 'react';

//numbered tab pills with chevron separators
//tabs: [{id, title, sub, icon}]
export default function TabNav({ tabs, active, onChange }){
    return (
        <nav className="tabnav" role="tablist" aria-label="Demos">
            {tabs.map((t, i) => {
                const Icon = t.icon;
                return (
                    <Fragment key={t.id}>
                        <button
                            role="tab"
                            aria-selected={active === t.id}
                            className={'tab ' + (active === t.id ? 'tab--active' : '')}
                            onClick={() => onChange(t.id)}
                        >
                            <span className="tab__num">{String(i + 1).padStart(2, '0')}</span>
                            <span className="tab__icon" aria-hidden="true"><Icon /></span>
                            <span className="tab__label">
                                <span className="tab__title">{t.title}</span>
                                <span className="tab__sub">{t.sub}</span>
                            </span>
                        </button>
                        {i < tabs.length - 1 && (
                            <span className="tab__sep" aria-hidden="true">
                                <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                                    <path d="M9 6 L15 12 L9 18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                            </span>
                        )}
                    </Fragment>
                );
            })}
        </nav>
    );
}
