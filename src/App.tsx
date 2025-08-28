import { useState, useEffect, FC } from 'react';

// --- Type Definitions ---
interface SelectedElement {
  tag: string;
  id: string;
  classes: string;
  width: number;
  height: number;
  fontFamily: string;
  fontSize: string;
  fontWeight: string;
  color: string;
  backgroundColor: string;
  eventListeners?: Record<string, any[]>;
}

// --- Helper Functions ---
const copyToClipboard = (text: string) => {
  navigator.clipboard.writeText(text).catch(err => console.error('Failed to copy: ', err));
};

const parseRgb = (rgb: string): [number, number, number] | null => {
    const match = rgb.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    if (!match) return null;
    return [parseInt(match[1]), parseInt(match[2]), parseInt(match[3])];
}

const toHex = (c: number) => ('0' + c.toString(16)).slice(-2);

const rgbToHex = (rgb: string) => {
    const parsed = parseRgb(rgb);
    if (!parsed) return 'N/A';
    return `#${toHex(parsed[0])}${toHex(parsed[1])}${toHex(parsed[2])}`.toUpperCase();
}


// --- Components ---
const Icon: FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <span className={`flex items-center justify-center w-6 h-6 ${className}`}>
    {children}
  </span>
);

const NavItem: FC<{ icon: React.ReactNode; label: string; active: boolean; onClick: () => void }> = ({ icon, label, active, onClick }) => (
  <button
    onClick={onClick}
    title={label}
    className={`flex flex-col items-center justify-center w-full h-20 transition-colors duration-200 focus:outline-none ${
      active ? 'bg-gray-700 text-white' : 'text-gray-400 hover:bg-gray-800'
    }`}
  >
    {icon}
    <span className="text-xs mt-1 tracking-wider">{label}</span>
  </button>
);

const InspectorButton: FC<{ active: boolean; onClick: () => void }> = ({ active, onClick }) => (
    <button
        onClick={onClick}
        className={`w-full flex items-center justify-center p-3 rounded-lg transition-colors duration-200 ${
            active ? 'bg-blue-600 text-white shadow-lg' : 'bg-gray-600 hover:bg-gray-500'
        }`}
    >
        <Icon>{active ? '🖱️' : '▶️'}</Icon>
        <span className="ml-2 font-semibold">{active ? 'Inspecting...' : 'Activate Inspector'}</span>
    </button>
);

const InfoSection: FC<{title: string, children: React.ReactNode}> = ({ title, children }) => (
    <div className="bg-[#333333] p-3 rounded-lg">
        <h3 className="text-sm font-semibold text-gray-400 mb-2">{title}</h3>
        <div className="space-y-2 text-sm">{children}</div>
    </div>
);

const ColorSwatch: FC<{color: string}> = ({ color }) => (
    <div className="w-5 h-5 rounded-full border border-white/20 inline-block mr-2" style={{ backgroundColor: color }} />
);

const ColorValue: FC<{label: string, value: string}> = ({label, value}) => (
    <div className="flex items-center justify-between bg-black/20 p-2 rounded">
        <span className="font-mono text-gray-300">{value}</span>
        <button onClick={() => copyToClipboard(value)} title={`Copy ${label}`} className="text-xs bg-gray-600 hover:bg-gray-500 text-white px-2 py-1 rounded">
            Copy
        </button>
    </div>
)

const ColorCard: FC<{title: string, color: string}> = ({ title, color }) => (
    <div className="bg-[#333333] p-4 rounded-lg">
        <h3 className="text-md font-semibold text-gray-200 mb-3">{title}</h3>
        <div className="flex items-center space-x-4 mb-4">
            <div className="w-16 h-16 rounded-lg border-2 border-white/20" style={{backgroundColor: color}} />
            <div className="flex-1 space-y-2">
                <ColorValue label="HEX" value={rgbToHex(color)} />
                <ColorValue label="RGB" value={color} />
            </div>
        </div>
    </div>
);

const EmptyState: FC<{title: string, message: string}> = ({ title, message }) => (
    <div className="text-center text-gray-400 mt-10 p-4">
        <p className="font-semibold">{title}</p>
        <p className="text-sm mt-2">{message}</p>
    </div>
)

function App() {
  const [activeTab, setActiveTab] = useState('Inspect');
  const [selectedElement, setSelectedElement] = useState<SelectedElement | null>(null);
  const [isInspecting, setIsInspecting] = useState(true);
  const [isDomTreeHighlighted, setIsDomTreeHighlighted] = useState(false);
  const [eventListeners, setEventListeners] = useState<Record<string, any[]> | null>(null);
  const [css, setCss] = useState('');

  // Effect to handle messages from the content script
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.source !== window.parent) return;

      const { action, payload } = event.data;
      if (action === 'element_selected') {
        setSelectedElement(payload);
        setIsInspecting(false);
        setEventListeners(null); // Reset listeners on new element
      } else if (action === 'event_listeners_updated') {
        setEventListeners(payload);
      } else if (action === 'css_updated') {
        setCss(payload);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const toggleInspector = () => {
    const newInspectingState = !isInspecting;
    window.parent.postMessage({ action: newInspectingState ? 'start_inspector' : 'stop_inspector' }, '*');
    setIsInspecting(newInspectingState);
  };

  const handleClosePanel = () => {
      window.parent.postMessage({ action: 'close_panel' }, '*');
  }

  const toggleDomTreeHighlight = () => {
    const newState = !isDomTreeHighlighted;
    setIsDomTreeHighlighted(newState);
    window.parent.postMessage({ action: 'toggle_dom_tree_highlight', payload: newState }, '*');
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'Inspect':
        return (
          <div className="p-4 text-gray-300 space-y-3">
            <InspectorButton active={isInspecting} onClick={toggleInspector} />
            {selectedElement ? (
              <div className="space-y-3">
                <InfoSection title="General">
                    <p><strong>Tag:</strong> <span className="font-mono bg-black/20 px-2 py-1 rounded">{selectedElement.tag}</span></p>
                    <p><strong>ID:</strong> {selectedElement.id ? <span className="font-mono bg-black/20 px-2 py-1 rounded">{selectedElement.id}</span> : <em>none</em>}</p>
                    <div><strong>Classes:</strong> {selectedElement.classes ? selectedElement.classes.split(' ').filter(c=>c).map(c => <span key={c} className="font-mono bg-black/20 mr-1 mb-1 inline-block px-2 py-1 rounded text-xs">{c}</span>) : <em>none</em>}</div>
                    <button
                        onClick={toggleDomTreeHighlight}
                        className={`w-full text-left p-2 mt-2 rounded transition-colors duration-200 ${
                            isDomTreeHighlighted ? 'bg-red-500 text-white' : 'bg-gray-600 hover:bg-gray-500'
                        }`}
                    >
                        {isDomTreeHighlighted ? 'Disable' : 'Enable'} DOM Tree Highlight
                    </button>
                </InfoSection>
                 <InfoSection title="Size">
                    <div className="flex space-x-6">
                        <p><strong>Width:</strong> {selectedElement.width}px</p>
                        <p><strong>Height:</strong> {selectedElement.height}px</p>
                    </div>
                </InfoSection>
                <InfoSection title="Typography">
                    <p><strong>Font:</strong> {selectedElement.fontFamily}</p>
                    <p><strong>Size:</strong> {selectedElement.fontSize}</p>
                    <p><strong>Weight:</strong> {selectedElement.fontWeight}</p>
                </InfoSection>
                <InfoSection title="Appearance">
                    <p className="flex items-center"><strong>Color:</strong> <ColorSwatch color={selectedElement.color} /> {selectedElement.color}</p>
                    <p className="flex items-center"><strong>Background:</strong> <ColorSwatch color={selectedElement.backgroundColor} /> {selectedElement.backgroundColor}</p>
                </InfoSection>
                <InfoSection title="Event Listeners">
                    {!eventListeners ? (
                        <p>Loading...</p>
                    ) : Object.keys(eventListeners).length === 0 ? (
                        <p>No event listeners found.</p>
                    ) : (
                        Object.entries(eventListeners).map(([event, listeners]) => (
                            <div key={event}>
                                <strong>{event}</strong>
                                <ul className="list-disc pl-5">
                                    {listeners.map((l, i) => (
                                        <li key={i} className="font-mono text-xs truncate" title={l.listener}>
                                            {l.listener.substring(0, 100)}...
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        ))
                    )}
                </InfoSection>
              </div>
            ) : (
              <EmptyState title="Activate the inspector to get started." message="Hover over any element on the page to see its properties. Click to pin it here." />
            )}
          </div>
        );
      case 'Colors':
        if (!selectedElement) {
            return <EmptyState title="No Element Selected" message="Use the 'Inspect' tab to select an element and see its colors." />
        }
        return (
            <div className="p-4 space-y-4">
                <ColorCard title="Text Color" color={selectedElement.color} />
                <ColorCard title="Background Color" color={selectedElement.backgroundColor} />
            </div>
        )
      case 'Fonts':
        return <div className="p-5 text-gray-300">Typography Explorer Content Placeholder</div>;
      case 'Assets':
        return <div className="p-5 text-gray-300">Asset Browser Content Placeholder</div>;
      case 'CSS':
        if (!selectedElement) {
            return <EmptyState title="No Element Selected" message="Use the 'Inspect' tab to select an element and edit its CSS." />
        }
        return (
            <div className="p-4 h-full flex flex-col">
                <textarea
                    className="w-full flex-grow bg-black/20 p-2 rounded font-mono text-sm"
                    value={css}
                    onChange={(e) => {
                        setCss(e.target.value);
                        window.parent.postMessage({ action: 'update_css', payload: e.target.value }, '*');
                    }}
                />
            </div>
        )
      default:
        return null;
    }
  };

  return (
    <div className="fixed top-0 right-0 h-screen w-[380px] bg-[#1e1e1e] text-white shadow-2xl flex flex-col z-[99999999] font-sans">
      <div className="flex flex-1 overflow-hidden">
        <nav className="w-20 bg-black/20 flex flex-col items-center pt-5">
          <div className="h-20 flex items-center justify-center" title="css crater">
            <img src="/icon.png" alt="css crater logo" className="w-8 h-8" />
          </div>
          <NavItem icon={<Icon>🔍</Icon>} label="Inspect" active={activeTab === 'Inspect'} onClick={() => setActiveTab('Inspect')} />
          <NavItem icon={<Icon>🎨</Icon>} label="Colors" active={activeTab === 'Colors'} onClick={() => setActiveTab('Colors')} />
          <NavItem icon={<Icon>✒️</Icon>} label="Fonts" active={activeTab === 'Fonts'} onClick={() => setActiveTab('Fonts')} />
          <NavItem icon={<Icon>🖼️</Icon>} label="Assets" active={activeTab === 'Assets'} onClick={() => setActiveTab('Assets')} />
          <NavItem icon={<Icon>🎨</Icon>} label="CSS" active={activeTab === 'CSS'} onClick={() => setActiveTab('CSS')} />
        </nav>
        <main className="flex-1 flex flex-col bg-[#2a2a2a]">
          <header className="h-16 flex items-center justify-between px-5 border-b border-white/10 flex-shrink-0">
            <h1 className="text-lg font-medium text-gray-200">{activeTab}</h1>
            <button onClick={handleClosePanel} title="Close Panel" className="text-gray-400 hover:text-white transition-colors duration-200 focus:outline-none">
              <Icon>✖️</Icon>
            </button>
          </header>
          <div className="flex-1 overflow-y-auto">
            {renderContent()}
          </div>
        </main>
      </div>
    </div>
  );
}

export default App;
