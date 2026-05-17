import { useState } from 'react';
import { FaBolt, FaChartColumn, FaMicrochip } from 'react-icons/fa6';
import ShaderBackground from './components/ShaderBackground';
import LiquidGlassDefs from './components/LiquidGlassDefs';
import TabNav from './components/TabNav';
import { ExplainProvider } from './components/ExplainContext';
import ExplainSidebar from './components/ExplainSidebar';
import TimingAttack from './pages/TimingAttack';
import SimulatedTraces from './pages/SimulatedTraces';
import RealTraces from './pages/RealTraces';

const TABS = [
    {id: 'timing', title: 'Live timing attack', sub: 'naive compare', icon: FaBolt},
    {id: 'sim',    title: 'Simulated traces',   sub: 'CPA',           icon: FaChartColumn},
    {id: 'real',   title: 'Real traces',        sub: 'ASCAD',         icon: FaMicrochip},
];

export default function App(){
    const [tab, setTab] = useState('timing');

    return (
        <ExplainProvider>
            <ShaderBackground />
            <LiquidGlassDefs />
            <div className="shell">
                <div className="workspace">
                    <main className="panel">
                        <div className="panel__top">
                            <div className="panel__title">
                                <h1>Side-channel demo</h1>
                                <span className="panel__sub mono">recovering secrets from timing &amp; power</span>
                            </div>
                            <TabNav tabs={TABS} active={tab} onChange={setTab} />
                        </div>
                        <div className="panel__body">
                            {tab === 'timing' && <TimingAttack />}
                            {tab === 'sim'    && <SimulatedTraces />}
                            {tab === 'real'   && <RealTraces />}
                        </div>
                    </main>
                    <ExplainSidebar />
                </div>
                <p className="foot mono">Educational demonstrations only · no real keys are at risk</p>
            </div>
            {/* portal target for ControlBar */}
            <div id="controlbar" />
        </ExplainProvider>
    );
}
