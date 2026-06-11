import React, { useState, useEffect, useRef } from 'react';
import { 
  Upload, 
  Image as ImageIcon, 
  Settings2, 
  Download, 
  Maximize2, 
  FileImage, 
  Sparkles, 
  RefreshCw, 
  Sliders, 
  FolderIcon, 
  ShieldCheck, 
  Zap, 
  User, 
  Check, 
  HelpCircle,
  Minimize2,
  Lock,
  Ratio,
  Info,
  Code,
  Share2
} from 'lucide-react';
import { 
  loadImage, 
  eraseBackground, 
  renderToCanvas, 
  optimizeAndCompress, 
  ProcessSettings, 
  ProcessResult 
} from './utils/imageProcessor';

export default function App() {
  // Original Image State
  const [originalFile, setOriginalFile] = useState<File | null>(null);
  const [originalDataUrl, setOriginalDataUrl] = useState<string | null>(null);
  const [originalImgElement, setOriginalImgElement] = useState<HTMLImageElement | null>(null);
  
  // File detail metrics
  const [originalMetrics, setOriginalMetrics] = useState<{
    width: number;
    height: number;
    sizeKb: number;
    format: string;
  } | null>(null);

  // Settings
  const [settings, setSettings] = useState<ProcessSettings>({
    width: 600,
    height: 800,
    backgroundType: 'white',
    customBackgroundColor: '#3B82F6',
    removeBackground: true,
    backgroundRemovalThreshold: 15,
    fitMode: 'contain',
    targetSizeKb: 19,
  });

  // Target size input strings (handles intermediate typed values)
  const [targetSizeInput, setTargetSizeInput] = useState<string>('19');
  const [widthInput, setWidthInput] = useState<string>('600');
  const [heightInput, setHeightInput] = useState<string>('800');

  // Interactive controls
  const [aspectRatioLock, setAspectRatioLock] = useState<boolean>(true);
  const [aspectRatioValue, setAspectRatioValue] = useState<number>(0.75); // 600 / 800

  // Output Result
  const [processedResult, setProcessedResult] = useState<ProcessResult | null>(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  
  // UI Interactive States
  const [dragActive, setDragActive] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'optimizer' | 'embed'>('optimizer');
  const [sliderPosition, setSliderPosition] = useState<number>(50); // Before / After slider percent (0-100)
  const [showMagnifier, setShowMagnifier] = useState<boolean>(false);
  const [magnifierPos, setMagnifierPos] = useState({ x: 0, y: 0, cursorX: 0, cursorY: 0 });
  const [isDownloading, setIsDownloading] = useState<boolean>(false);
  const [toast, setToast] = useState<string | null>(null);

  // Embed Properties
  const [embedWidth, setEmbedWidth] = useState<string>('100%');
  const [embedHeight, setEmbedHeight] = useState<string>('720');
  const [embedBg, setEmbedBg] = useState<boolean>(true);
  const [embedShadow, setEmbedShadow] = useState<boolean>(true);
  const [currentOrigin, setCurrentOrigin] = useState<string>('');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const meta = import.meta as any;
      const appUrlFromEnv = (meta.env && meta.env.VITE_APP_URL) || '';
      setCurrentOrigin(appUrlFromEnv || window.location.origin);
    }
  }, []);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const compareContainerRef = useRef<HTMLDivElement>(null);

  // Auto show a toast notification
  const triggerToast = (text: string) => {
    setToast(text);
    setTimeout(() => setToast(null), 3000);
  };

  // 1. Handle File Selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setupImage(e.target.files[0]);
    }
  };

  const setupImage = (file: File) => {
    // Validate file type
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      triggerToast('Unsupported file type! Please upload JPG, JPEG, PNG, or WEBP.');
      return;
    }

    setOriginalFile(file);
    const url = URL.createObjectURL(file);
    setOriginalDataUrl(url);

    // Read details
    loadImage(url).then((img) => {
      setOriginalImgElement(img);
      setOriginalMetrics({
        width: img.naturalWidth,
        height: img.naturalHeight,
        sizeKb: parseFloat((file.size / 1024).toFixed(1)),
        format: file.type.replace('image/', '').toUpperCase()
      });
      // Store original aspect ratio if locking
      const ratio = img.naturalWidth / img.naturalHeight;
      setAspectRatioValue(ratio);
      
      // Auto settings triggers from image size if requested, 
      // but guidelines specify default is automatic 600x800 resolution with 19 KB.
      triggerToast('Image uploaded successfully. Applying default 19 KB optimizations.');
    }).catch(() => {
      triggerToast('Error loading image. Please try another file.');
    });
  };

  // Drag and Drop support
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setupImage(e.dataTransfer.files[0]);
    }
  };

  // 2. Perform Real-time Image Processing
  useEffect(() => {
    if (!originalImgElement) return;

    let isSubscribed = true;
    const processImage = async () => {
      setIsProcessing(true);
      try {
        // Step A: Background removal/chromakey if enabled
        let currentSource: HTMLImageElement | HTMLCanvasElement = originalImgElement;
        
        if (settings.removeBackground) {
          // Removes background to generate transparency
          currentSource = eraseBackground(originalImgElement, settings.backgroundRemovalThreshold);
        }

        // Step B: Render to final resized canvas with requested background and fit settings
        const renderedCanvas = renderToCanvas(currentSource, settings);

        // Step C: Compression binary search to hit precise target size
        const isTransparent = settings.backgroundType === 'transparent';
        const result = await optimizeAndCompress(renderedCanvas, settings.targetSizeKb, isTransparent);

        if (isSubscribed) {
          setProcessedResult(result);
        }
      } catch (error) {
        console.error('Error during image processing:', error);
      } finally {
        if (isSubscribed) {
          setIsProcessing(false);
        }
      }
    };

    // Debounce processing slightly for rapid inputs (e.g. range sliders, fast typings)
    const timeoutId = setTimeout(() => {
      processImage();
    }, 150);

    return () => {
      isSubscribed = false;
      clearTimeout(timeoutId);
    };
  }, [originalImgElement, settings]);

  // Adjust settings for Width / Height based on Locked Aspect Ratio
  const handleDimensionChange = (val: string, type: 'width' | 'height') => {
    const num = parseInt(val) || 0;
    if (type === 'width') {
      setWidthInput(val);
      if (num > 0) {
        if (aspectRatioLock) {
          const newHeight = Math.round(num / aspectRatioValue);
          setHeightInput(newHeight.toString());
          setSettings(prev => ({ ...prev, width: num, height: newHeight }));
        } else {
          setSettings(prev => ({ ...prev, width: num }));
        }
      }
    } else {
      setHeightInput(val);
      if (num > 0) {
        if (aspectRatioLock) {
          const newWidth = Math.round(num * aspectRatioValue);
          setWidthInput(newWidth.toString());
          setSettings(prev => ({ ...prev, height: num, width: newWidth }));
        } else {
          setSettings(prev => ({ ...prev, height: num }));
        }
      }
    }
  };

  // Choose preset resolution
  const handlePreset = (w: number, h: number) => {
    setWidthInput(w.toString());
    setHeightInput(h.toString());
    setAspectRatioValue(w / h);
    setSettings(prev => ({ ...prev, width: w, height: h }));
  };

  // Choose custom target size
  const handleTargetSizeChange = (val: string) => {
    setTargetSizeInput(val);
    const kb = parseFloat(val);
    if (!isNaN(kb) && kb > 0) {
      setSettings(prev => ({ ...prev, targetSizeKb: kb }));
    } else if (val === '') {
      setSettings(prev => ({ ...prev, targetSizeKb: null }));
    }
  };

  // Reset parameters to Default (600x800, white background, 19KB compression)
  const resetToDefaults = () => {
    setSettings({
      width: 600,
      height: 800,
      backgroundType: 'white',
      customBackgroundColor: '#3B82F6',
      removeBackground: true,
      backgroundRemovalThreshold: 15,
      fitMode: 'contain',
      targetSizeKb: 19,
    });
    setWidthInput('600');
    setHeightInput('800');
    setTargetSizeInput('19');
    setAspectRatioLock(true);
    setAspectRatioValue(600 / 800);
    triggerToast('All parameters reset to professional default rules.');
  };

  // Download Output File
  const handleDownload = async () => {
    if (!processedResult) return;
    setIsDownloading(true);

    try {
      const extension = settings.backgroundType === 'transparent' ? 'png' : 'jpg';
      const timestamp = new Date().toISOString().replace(/[-:T]/g, '_').split('.')[0];
      const filename = `image_resized_${timestamp}.${extension}`;

      const link = document.createElement('a');
      link.href = processedResult.dataUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      triggerToast(`Successfully downloaded: ${filename}`);
    } catch (err) {
      triggerToast('Download failed. Please try again.');
    } finally {
      setIsDownloading(false);
    }
  };

  // Before/After mouse mover for compare slider
  const handleCompareMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!compareContainerRef.current) return;
    const rect = compareContainerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = Math.max(0, Math.min(100, (x / rect.width) * 100));
    setSliderPosition(percentage);
  };

  const handleCompareTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!compareContainerRef.current || e.touches.length === 0) return;
    const rect = compareContainerRef.current.getBoundingClientRect();
    const x = e.touches[0].clientX - rect.left;
    const percentage = Math.max(0, Math.min(100, (x / rect.width) * 100));
    setSliderPosition(percentage);
  };

  // Magnifier Lens position handler
  const handleMagnifierMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!compareContainerRef.current) return;
    const rect = compareContainerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    // clamp position
    const relX = Math.max(0, Math.min(1, x / rect.width));
    const relY = Math.max(0, Math.min(1, y / rect.height));

    setMagnifierPos({
      x: relX,
      y: relY,
      cursorX: x,
      cursorY: y
    });
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#F3F4F6] text-gray-800 font-sans">
      
      {/* SIDEBAR : Dark Navy (#0F172A) */}
      <aside className="hidden md:flex flex-col w-64 bg-[#0F172A] text-slate-300 h-full flex-shrink-0 z-10 border-r border-[#1E293B]">
        {/* Brand Display */}
        <div className="p-6 border-b border-[#1E293B]">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 text-white shadow-lg">
              <ShieldCheck className="w-5 h-5" id="sidebar-logo-icon" />
            </div>
            <div>
              <h1 className="text-white font-bold leading-none tracking-tight text-lg" id="app-brand-name">
                image_resizer
              </h1>
              <span className="text-[10px] text-slate-400 tracking-wider uppercase font-semibold">Image Processor</span>
            </div>
          </div>
        </div>

        {/* Minimalist Navigation */}
        <nav className="flex-1 p-4 space-y-1">
          <button 
            onClick={() => setActiveTab('optimizer')}
            className={`flex items-center w-full gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all ${
              activeTab === 'optimizer' 
                ? 'bg-blue-600/10 text-blue-400 border-l-2 border-blue-500' 
                : 'hover:bg-slate-800/50 text-slate-400 hover:text-slate-200'
            }`}
            id="nav-navitem-optimizer"
          >
            <Sliders className="w-4 h-4 text-blue-500" />
            <span>Image Optimizer</span>
            <span className="ml-auto bg-blue-500/20 text-blue-400 text-[10px] px-1.5 py-0.5 rounded font-bold">LIVE</span>
          </button>

          <button 
            onClick={() => setActiveTab('embed')}
            className={`flex items-center w-full gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all ${
              activeTab === 'embed' 
                ? 'bg-blue-600/10 text-blue-400 border-l-2 border-blue-500' 
                : 'hover:bg-slate-800/50 text-slate-400 hover:text-slate-200'
            }`}
            id="nav-navitem-embed"
          >
            <Code className="w-4 h-4 text-blue-500" />
            <span>Embed in Google Blog</span>
            <span className="ml-auto bg-emerald-500/20 text-emerald-400 text-[10px] px-1.5 py-0.5 rounded font-bold">IFRAME</span>
          </button>
        </nav>

        {/* Sidebar Footer Info */}
        <div className="p-4 border-t border-[#1E293B] bg-[#090d16] text-xs text-slate-400">
          <p className="font-semibold text-white mb-1">Local Sandbox</p>
          <p className="text-[11px] leading-relaxed">Images are processed locally and never uploaded to any server.</p>
        </div>
      </aside>

      {/* MAIN CONTAINER */}
      <main className="flex-1 flex flex-col h-full overflow-hidden">
        
        {/* HEADER */}
        <header className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4 flex-shrink-0">
          <div className="flex items-center gap-4">
            {/* Mobile Logo fallback */}
            <div className="flex md:hidden items-center gap-2">
              <div className="w-8 h-8 rounded bg-gradient-to-tr from-blue-600 to-indigo-500 text-white flex items-center justify-center">
                <ShieldCheck className="w-4 h-4" />
              </div>
              <span className="font-bold text-gray-900 text-sm">image_resizer</span>
            </div>
            
            <h2 className="hidden md:block text-xl font-bold text-gray-900 tracking-tight" id="main-header-title">
              Asset Processing Lounge
            </h2>
            <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 text-xs font-semibold">
              <Sparkles className="w-3 h-3" />
              <span>Smart Resolution Mode</span>
            </div>
          </div>

          <div className="flex items-center gap-3 text-sm">
            <div className="hidden sm:flex flex-col items-end text-xs text-gray-500">
              <span className="font-medium text-gray-700">Secure Sandboxed Engine</span>
              <span>100% Client-Side Processing</span>
            </div>
            <button 
              onClick={resetToDefaults}
              className="flex items-center gap-2 justify-center px-3 py-1.5 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 text-xs font-medium cursor-pointer transition-all"
              title="Reset configuration parameters to defaults"
              id="reset-settings-button"
            >
              <RefreshCw className="w-3 h-3" />
              <span>Reset Settings</span>
            </button>
          </div>
        </header>

        {/* INNER WORKSPACE BODY */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8 space-y-6">
          
          {/* TOAST NOTIFICATION */}
          {toast && (
            <div className="fixed top-20 right-6 z-50 bg-[#0F172A] text-slate-100 text-sm py-3 px-5 rounded-xl shadow-2xl flex items-center gap-3 border border-slate-700 animate-bounce">
              <div className="w-2 h-2 rounded-full bg-blue-500 animate-ping"></div>
              <span>{toast}</span>
            </div>
          )}

          {activeTab === 'embed' ? (
            <div className="max-w-4xl mx-auto space-y-6 animate-fade-in" id="embed-wizard-view">
              {/* Embed Screen Title */}
              <div className="bg-white rounded-2xl border border-gray-200 p-6 md:p-8 shadow-sm space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-500 text-white flex items-center justify-center shadow-md flex-shrink-0">
                    <Code className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-gray-900 tracking-tight">
                      Google Blog Iframe Embed Generator
                    </h3>
                    <p className="text-gray-500 text-xs sm:text-sm mt-0.5 animate-pulse">
                      Copy the custom-styled responsive HTML iframe element code below to integrate the <span className="font-semibold text-blue-600">image_resizer</span> widget directly on your Google Blog (Blogger, WordPress, or Google Sites).
                    </p>
                  </div>
                </div>
              </div>

              {/* Two Column Customizer */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
                
                {/* Embed Preferences Card */}
                <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm space-y-6">
                  <h4 className="font-bold text-gray-900 text-sm border-b border-gray-100 pb-3 uppercase tracking-wider flex items-center gap-2">
                    <Settings2 className="w-4 h-4 text-emerald-500" />
                    <span>Configure Iframe Sizing</span>
                  </h4>

                  <div className="space-y-4">
                    {/* Source URL display */}
                    <div>
                      <span className="text-xs font-bold text-gray-700 block mb-1">Widget Source URL</span>
                      <input 
                        type="text" 
                        readOnly 
                        value={currentOrigin || 'Generating...'} 
                        className="w-full px-3 py-2 text-xs bg-gray-50 border border-gray-200 rounded-lg font-mono text-gray-600 select-all focus:outline-none"
                      />
                      <p className="text-[11px] text-gray-400 mt-1">This is the secure URL that will load in your blog iframe container.</p>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      {/* Width parameter */}
                      <div>
                        <span className="text-xs font-bold text-gray-700 block mb-1">Iframe Width</span>
                        <input 
                          type="text" 
                          value={embedWidth || '100%'} 
                          onChange={(e) => setEmbedWidth(e.target.value)}
                          placeholder="e.g. 100% or 800px" 
                          className="w-full px-3 py-2 text-xs bg-gray-50 border border-gray-300 rounded-lg text-gray-800 font-medium focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                        />
                      </div>

                      {/* Height parameter */}
                      <div>
                        <span className="text-xs font-bold text-gray-700 block mb-1">Iframe Height (px)</span>
                        <input 
                          type="text" 
                          value={embedHeight || '720'} 
                          onChange={(e) => setEmbedHeight(e.target.value)}
                          placeholder="e.g. 720" 
                          className="w-full px-3 py-2 text-xs bg-gray-50 border border-gray-300 rounded-lg text-gray-800 font-medium focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                        />
                      </div>
                    </div>

                    <div className="space-y-2.5 pt-2">
                      {/* Toggle rounded borders decoration */}
                      <label id="embed-rounded-toggle" className="flex items-center justify-between p-2.5 bg-gray-50 rounded-xl border border-gray-150 cursor-pointer select-none">
                        <span className="text-xs font-semibold text-gray-700">Add Rounded Borders (12px radius)</span>
                        <input 
                          type="checkbox" 
                          checked={embedBg}
                          onChange={(e) => setEmbedBg(e.target.checked)}
                          className="rounded text-emerald-500 cursor-pointer w-4 h-4"
                        />
                      </label>

                      {/* Toggle elegant shadow decoration */}
                      <label id="embed-shadow-toggle" className="flex items-center justify-between p-2.5 bg-gray-50 rounded-xl border border-gray-150 cursor-pointer select-none">
                        <span className="text-xs font-semibold text-gray-700">Add Soft Drop-Shadow Accent</span>
                        <input 
                          type="checkbox" 
                          checked={embedShadow}
                          onChange={(e) => setEmbedShadow(e.target.checked)}
                          className="rounded text-emerald-500 cursor-pointer w-4 h-4"
                        />
                      </label>
                    </div>

                    {/* How to add to Google Blogger steps */}
                    <div className="bg-blue-50/50 rounded-xl border border-blue-100 p-4 space-y-2">
                      <h5 className="text-xs font-bold text-blue-800 flex items-center gap-1.5">
                        <HelpCircle className="w-3.5 h-3.5" />
                        <span>How to paste in Blogger / Google Blog:</span>
                      </h5>
                      <ol className="text-[11px] text-blue-700 space-y-1.5 list-decimal pl-4 leading-relaxed">
                        <li>Log into your <strong>Google Blogger</strong> dashboard and create or edit a post draft.</li>
                        <li>In the text editor, click the HTML view button (the &quot;&lt;/&gt;&quot; or pencil toggle switcher dropdown at the top-left) and select <strong>&quot;HTML View&quot;</strong>.</li>
                        <li>Paste the copied iframe snippet code exactly where you want the resizer widget to appear in the body.</li>
                        <li>Switch back to <strong>&quot;Compose View&quot;</strong> or click <strong>&quot;Preview&quot;</strong> to see your elegant, operational widget!</li>
                      </ol>
                    </div>
                  </div>
                </div>

                {/* Snippet Copy & Interactive preview */}
                <div className="space-y-6">
                  {/* Generated Snippet container */}
                  <div className="bg-slate-900 rounded-2xl p-5 text-slate-100 shadow-md space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Copy Embed Code</span>
                      <span className="text-[10px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded font-bold">HTML IFRAME</span>
                    </div>

                    <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 overflow-x-auto">
                      <code className="text-xs font-mono text-emerald-400 select-all whitespace-pre-wrap break-all">
                        {`<iframe src="${currentOrigin}" width="${embedWidth}" height="${embedHeight}" style="border: none; border-radius: ${embedBg ? '12px' : '0px'}; ${embedShadow ? 'box-shadow: 0 4px 20px rgba(0,0,0,0.08);' : ''}" allow="clipboard-write"></iframe>`}
                      </code>
                    </div>

                    <button 
                      onClick={() => {
                        const snippetStr = `<iframe src="${currentOrigin}" width="${embedWidth}" height="${embedHeight}" style="border: none; border-radius: ${embedBg ? '12px' : '0px'}; ${embedShadow ? 'box-shadow: 0 4px 20px rgba(0,0,0,0.08);' : ''}" allow="clipboard-write"></iframe>`;
                        navigator.clipboard.writeText(snippetStr);
                        triggerToast('Embed code copied successfully!');
                      }}
                      className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 font-extrabold py-3 rounded-xl text-sm transition-all text-white shadow-lg cursor-pointer animate-pulse"
                    >
                      <Check className="w-4 h-4" />
                      <span>Copy Code Snippet</span>
                    </button>
                  </div>

                  {/* Visualizer Mini Sandbox */}
                  <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm space-y-3">
                    <span className="text-[11px] font-bold text-gray-400 uppercase tracking-widest block font-sans">Virtual Blog Layout Preview</span>
                    <div className="p-4 bg-gray-50 border border-dashed border-gray-200 rounded-xl space-y-3">
                      <div className="h-4 bg-gray-200 rounded w-2/3"></div>
                      <div className="h-3 bg-gray-200 rounded w-full"></div>
                      
                      {/* Simulated Iframe box */}
                      <div 
                        className={`bg-white border text-center flex flex-col items-center justify-center p-6 transition-all ${
                          embedBg ? 'rounded-xl' : ''
                        } ${embedShadow ? 'shadow-md shadow-gray-200/20' : 'shadow-none'}`}
                        style={{ height: '140px' }}
                      >
                        <Sliders className="w-5 h-5 text-blue-500 animate-pulse mb-1.5" />
                        <span className="text-xs font-bold text-gray-800">Widget: image_resizer loaded</span>
                        <span className="text-[10px] text-gray-500 mt-1">Configured size: {embedWidth} × {embedHeight} height</span>
                      </div>

                      <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                    </div>
                  </div>
                </div>

              </div>
            </div>
          ) : (
            <>
              {/* IF NO IMAGE UPLOADED — Show Beautiful Drag and Drop State */}
              {!originalDataUrl ? (
            <div className="max-w-4xl mx-auto mt-6">
              <div className="text-center mb-8">
                <h3 className="text-2xl font-extrabold text-gray-900 tracking-tight" id="initial-hero-heading">
                  High-Fidelity Image Optimizer
                </h3>
                <p className="text-gray-500 text-sm mt-2 max-w-lg mx-auto">
                  Automatically strip backgrounds, rescale pixels to compliance standards, and optimize to perfect size restrictions instantly in your browser.
                </p>
              </div>

              <div 
                onDragEnter={handleDrag}
                onDragOver={handleDrag}
                onDragLeave={handleDrag}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-3 border-dashed rounded-2xl p-12 transition-all flex flex-col items-center justify-center cursor-pointer min-h-[360px] ${
                  dragActive 
                    ? 'border-blue-500 bg-blue-50/50 scale-98 shadow-inner' 
                    : 'border-gray-200 bg-white hover:border-gray-300 text-gray-500 hover:text-gray-700 shadow-sm hover:shadow-md'
                }`}
                id="dropzone-area"
              >
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={handleFileChange} 
                  accept="image/jpeg, image/jpg, image/png, image/webp"
                  className="hidden" 
                />

                <div className="w-16 h-16 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mb-5 shadow-sm transform transition duration-300 hover:scale-110">
                  <Upload className="w-8 h-8" />
                </div>

                <h4 className="text-lg font-bold text-gray-900">
                  Drag and drop your asset here
                </h4>
                <p className="text-xs text-gray-500 mt-2">
                  Accepted formats: <span className="font-semibold text-gray-700">PNG, JPG, JPEG, WEBP</span>
                </p>

                <div className="mt-6">
                  <span className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl text-sm shadow-md transition-all inline-flex items-center gap-2">
                    <ImageIcon className="w-4 h-4" />
                    Browse Files
                  </span>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-12 w-full max-w-2xl text-center">
                  <div className="p-3.5 bg-gray-50 rounded-xl border border-gray-100">
                    <p className="text-gray-900 font-bold text-sm">600 × 800</p>
                    <p className="text-gray-400 text-[10px] mt-0.5">SaaS Preset Output</p>
                  </div>
                  <div className="p-3.5 bg-gray-50 rounded-xl border border-gray-100">
                    <p className="text-gray-900 font-bold text-sm">19 KB size</p>
                    <p className="text-gray-400 text-[10px] mt-0.5">Default Weight Target</p>
                  </div>
                  <div className="p-3.5 bg-gray-50 rounded-xl border border-gray-100">
                    <p className="text-gray-900 font-bold text-sm">Pure White</p>
                    <p className="text-gray-400 text-[10px] mt-0.5">Auto Background swap</p>
                  </div>
                  <div className="p-3.5 bg-gray-50 rounded-xl border border-gray-100">
                    <p className="text-gray-900 font-bold text-sm">100% Secure</p>
                    <p className="text-gray-400 text-[10px] mt-0.5">Stays in browser</p>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            
            /* IF IMAGE IS READY — WORKSPACE ACTIVE */
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start max-w-7xl mx-auto">
              
              {/* LEFT COLUMN: INTERACTIVE VISUAL CANVAS workspace (7 cols) */}
              <div className="lg:col-span-7 space-y-6">
                
                {/* Visual Workspace Showcase Card */}
                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden flex flex-col">
                  
                  {/* Card Header showing tabs & live label */}
                  <div className="px-5 py-4 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
                    <div>
                      <h4 className="font-bold text-gray-900 text-sm flex items-center gap-2">
                        <ImageIcon className="w-4 h-4 text-blue-600" />
                        <span>Interactive Split Comparison</span>
                      </h4>
                      <p className="text-[11px] text-gray-500 mt-0.5">Drag comparison slider left/right • Hover for zoom lens</p>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-orange-500"></span>
                        <span className="text-[11px] font-bold text-gray-500 uppercase tracking-widest">Before</span>
                      </div>
                      <span className="text-gray-300">|</span>
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                        <span className="text-[11px] font-bold text-gray-500 uppercase tracking-widest">After</span>
                      </div>
                    </div>
                  </div>

                  {/* Main Compare Workspace viewport */}
                  <div 
                    ref={compareContainerRef}
                    onMouseMove={handleCompareMouseMove}
                    onTouchMove={handleCompareTouchMove}
                    onMouseEnter={() => setShowMagnifier(true)}
                    onMouseLeave={() => setShowMagnifier(false)}
                    className="relative w-full aspect-[4/3] bg-[#E5E7EB] bg-[radial-gradient(#CBD5E1_1px,transparent_1px)] [background-size:16px_16px] select-none overflow-hidden cursor-crosshair flex items-center justify-center p-4 border border-gray-200/80 rounded-xl shadow-inner-sm"
                    id="comparison-canvas-wrapper"
                  >
                    {isProcessing && (
                      <div className="absolute inset-0 bg-white/70 backdrop-blur-xs flex flex-col items-center justify-center z-40 transition-all">
                        <div className="flex items-center gap-3 bg-white p-4 rounded-xl shadow-lg border border-gray-100 animate-pulse">
                          <RefreshCw className="w-5 h-5 text-blue-600 animate-spin" />
                          <span className="text-sm font-semibold text-gray-800">Processing asset parameters...</span>
                        </div>
                      </div>
                    )}

                    {/* Split View Container */}
                    <div className="relative w-full h-full flex items-center justify-center overflow-hidden">
                      {/* Before (Original Image) – Render Centered Contain */}
                      <div className="absolute inset-0 flex items-center justify-center p-2">
                        <img 
                          src={originalDataUrl} 
                          alt="Before resize" 
                          className="w-full h-full object-contain pointer-events-none"
                        />
                      </div>

                      {/* Cover label - Before */}
                      <div className="absolute top-4 left-4 z-20 bg-black/60 backdrop-blur-xs text-white text-[10px] font-bold px-2 py-1 rounded">
                        ORIGINAL (BEFORE)
                      </div>

                      {/* After (Processed Image result) — clipped dynamic width based on slider position */}
                      <div 
                        className="absolute inset-y-0 left-0 right-0 z-10 flex items-center justify-center p-2 overflow-hidden bg-[#1E293B]/5 pointer-events-none"
                        style={{ clipPath: `polygon(0% 0%, ${sliderPosition}% 0%, ${sliderPosition}% 100%, 0% 100%)` }}
                      >
                        <img 
                          src={processedResult?.dataUrl || originalDataUrl} 
                          alt="Processed preview" 
                          className="w-full h-full object-contain pointer-events-none"
                          style={{ filter: isProcessing ? 'blur(1px)' : 'none' }}
                        />
                      </div>

                      {/* Cover label - After */}
                      <div className="absolute top-4 right-4 z-20 bg-blue-600/90 text-white text-[10px] font-bold px-2 py-1 rounded">
                        PROCESSED (AFTER)
                      </div>

                      {/* SLIDER HANDLE LINE BAR */}
                      <div 
                        className="absolute inset-y-0 z-30 w-1 bg-white hover:bg-blue-300 cursor-ew-resize flex items-center justify-center"
                        style={{ left: `${sliderPosition}%` }}
                      >
                        <div className="absolute w-7 h-7 rounded-full bg-white text-gray-800 flex items-center justify-center shadow-lg border border-gray-200 text-xs font-bold pointer-events-none transform -translate-x-1/2">
                          ↔
                        </div>
                      </div>

                      {/* REAL-TIME HOVER ZOOM MAGNIFIER LENS */}
                      {showMagnifier && processedResult && !isProcessing && (
                        <div 
                          className="absolute pointer-events-none z-30 border-2 border-blue-500 rounded-full shadow-2xl overflow-hidden hidden md:block"
                          style={{
                            width: '140px',
                            height: '140px',
                            left: `${magnifierPos.cursorX - 70}px`,
                            top: `${magnifierPos.cursorY - 70}px`,
                            backgroundImage: `url(${processedResult.dataUrl})`,
                            backgroundSize: `${compareContainerRef.current?.getBoundingClientRect().width * 2.5}px ${compareContainerRef.current?.getBoundingClientRect().height * 2.5}px`,
                            backgroundPosition: `-${magnifierPos.x * (compareContainerRef.current?.getBoundingClientRect().width * 2.5) - 70}px -${magnifierPos.y * (compareContainerRef.current?.getBoundingClientRect().height * 2.5) - 70}px`,
                            backgroundRepeat: 'no-repeat',
                          }}
                        />
                      )}
                    </div>
                  </div>

                  {/* Visual Instruction / Help strip */}
                  <div className="px-5 py-3 border-t border-gray-100 bg-gray-50 flex flex-wrap items-center justify-between text-xs text-gray-500 gap-2">
                    <span className="flex items-center gap-1.5">
                      <Maximize2 className="w-3.5 h-3.5 text-blue-500" />
                      We binary search standard parameters to hit exact weight targets.
                    </span>
                    <button 
                      onClick={() => fileInputRef.current?.click()}
                      className="text-blue-600 font-semibold hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      Swap Image Asset
                    </button>
                  </div>
                </div>

                {/* FILE INFORMATION METRIC GRID */}
                <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm space-y-4">
                  <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                    <h5 className="font-bold text-gray-900 text-sm flex items-center gap-2">
                      <FileImage className="w-4 h-4 text-slate-500" />
                      <span>Original vs Processed Metadata</span>
                    </h5>
                    <span className="text-[10px] text-gray-400 uppercase font-bold tracking-wider">File stats dashboard</span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* ORIGINAL COLUMN */}
                    <div className="p-4 rounded-xl bg-gray-50 border border-gray-150 relative overflow-hidden">
                      <div className="absolute top-0 right-0 w-16 h-16 bg-gray-100 transform rotate-45 translate-x-8 -translate-y-8 pointer-events-none"></div>
                      <p className="text-xs font-extrabold text-gray-400 uppercase tracking-wider">Original Subject</p>
                      {originalMetrics && (
                        <div className="mt-3 space-y-2">
                          <div className="flex justify-between text-xs">
                            <span className="text-gray-500">Dimensions</span>
                            <span className="font-bold text-gray-900">{originalMetrics.width} × {originalMetrics.height} px</span>
                          </div>
                          <div className="flex justify-between text-xs">
                            <span className="text-gray-500">File Weight</span>
                            <span className="font-bold text-gray-900">{originalMetrics.sizeKb} KB</span>
                          </div>
                          <div className="flex justify-between text-xs">
                            <span className="text-gray-500">File Type</span>
                            <span className="font-bold text-gray-900 px-1.5 py-0.5 rounded bg-gray-200 text-[10px]">{originalMetrics.format}</span>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* PROCESSED COLUMN */}
                    <div className="p-4 rounded-xl bg-blue-50/50 border border-blue-100 relative overflow-hidden">
                      <div className="absolute top-0 right-0 w-16 h-16 bg-blue-100/30 transform rotate-45 translate-x-8 -translate-y-8 pointer-events-none"></div>
                      <p className="text-xs font-extrabold text-blue-500 uppercase tracking-wider flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-blue-500" />
                        Optimized Export
                      </p>
                      <div className="mt-3 space-y-2">
                        <div className="flex justify-between text-xs">
                          <span className="text-gray-500">Target Canvas</span>
                          <span className="font-bold text-gray-900">{settings.width} × {settings.height} px</span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-gray-500">Result File Size</span>
                          <span className="font-bold text-blue-700 flex items-center gap-1">
                            {processedResult ? parseFloat((processedResult.sizeBytes / 1024).toFixed(1)) : '??'} KB
                            <span className="text-[10px] text-gray-400">
                              (Target: {settings.targetSizeKb ? `${settings.targetSizeKb}KB` : 'N/A'})
                            </span>
                          </span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-gray-500">Optimized Format</span>
                          <span className="font-bold text-blue-700 px-1.5 py-0.5 rounded bg-blue-100/80 text-[10px]">
                            {settings.backgroundType === 'transparent' ? 'PNG (lossless)' : 'JPEG (optimized)'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

              </div>
              
              {/* RIGHT COLUMN: RE-SIZING & COMPRESSING SETTINGS PANEL (5 cols) */}
              <div className="lg:col-span-5 space-y-6">
                
                {/* SETTINGS CARD */}
                <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm space-y-6">
                  
                  {/* Panel Title */}
                  <div className="flex items-center justify-between border-b border-gray-100 pb-4">
                    <div>
                      <h4 className="font-bold text-gray-900 text-base flex items-center gap-2">
                        <Settings2 className="w-5 h-5 text-blue-600" />
                        <span>Resizer parameters</span>
                      </h4>
                      <p className="text-xs text-gray-500 mt-0.5">Define constraints applied instantly</p>
                    </div>
                    <span className="text-xs text-blue-600 font-bold bg-blue-50 px-2 py-1 rounded">Real-Time</span>
                  </div>

                  {/* 1. BACKGROUND REMOVAL & FILL OPTIONS */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-gray-800 uppercase tracking-wider flex items-center gap-1.5">
                        <span>Background & Eraser Options</span>
                      </label>
                      <span className="text-[10px] text-gray-400 flex items-center gap-0.5">
                        <Info className="w-2.5 h-2.5" />
                        Supports PNG transparency alpha
                      </span>
                    </div>

                    {/* Chromakey toggle */}
                    <div className="p-3 bg-gray-50 rounded-xl border border-gray-150 flex items-center justify-between gap-4">
                      <div className="space-y-0.5">
                        <p className="text-xs font-bold text-gray-800">Automatic Background Removal</p>
                        <p className="text-[11px] text-gray-500">Detect corners & convert into blank canvas transparency</p>
                      </div>
                      <label id="remove-bg-toggle-container" className="relative inline-flex items-center cursor-pointer select-none">
                        <input 
                          type="checkbox" 
                          checked={settings.removeBackground}
                          onChange={(e) => setSettings(prev => ({ ...prev, removeBackground: e.target.checked }))}
                          className="sr-only peer" 
                        />
                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                      </label>
                    </div>

                    {/* Edge Threshold Slider (only shows when remove bg is enabled) */}
                    {settings.removeBackground && (
                      <div className="p-3 bg-blue-50/50 rounded-xl border border-blue-100 space-y-2">
                        <div className="flex justify-between text-xs">
                          <span className="text-blue-700 font-medium">Chroma Eraser Sensitivity:</span>
                          <span className="font-bold text-blue-900">{settings.backgroundRemovalThreshold}%</span>
                        </div>
                        <input 
                          type="range" 
                          min="1" 
                          max="80" 
                          value={settings.backgroundRemovalThreshold}
                          onChange={(e) => setSettings(prev => ({ ...prev, backgroundRemovalThreshold: parseInt(e.target.value) }))}
                          className="w-full h-1.5 bg-blue-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                        />
                        <p className="text-[10px] text-blue-600/80 leading-relaxed">
                          Increase this tolerance threshold to crop out slightly distorted shadows or diverse colored margins.
                        </p>
                      </div>
                    )}

                    {/* Background Target Fills */}
                    <div className="grid grid-cols-3 gap-2 pt-1.5">
                      <button 
                        onClick={() => setSettings(prev => ({ ...prev, backgroundType: 'white' }))}
                        className={`py-2.5 px-3 rounded-lg text-xs font-bold transition-all border flex flex-col items-center gap-1.5 cursor-pointer ${
                          settings.backgroundType === 'white' 
                            ? 'border-blue-600 bg-blue-50/40 text-blue-700 font-extrabold shadow-xs' 
                            : 'border-gray-200 hover:border-gray-300 bg-white text-gray-700'
                        }`}
                        id="bgtype-white"
                      >
                        <div className="w-4 h-4 rounded-full border border-gray-300 bg-white"></div>
                        <span>White BG</span>
                      </button>

                      <button 
                        onClick={() => setSettings(prev => ({ ...prev, backgroundType: 'transparent' }))}
                        className={`py-2.5 px-3 rounded-lg text-xs font-bold transition-all border flex flex-col items-center gap-1.5 cursor-pointer ${
                          settings.backgroundType === 'transparent' 
                            ? 'border-blue-600 bg-blue-50/40 text-blue-700 font-extrabold shadow-xs' 
                            : 'border-gray-200 hover:border-gray-300 bg-white text-gray-700'
                        }`}
                        id="bgtype-transparent"
                      >
                        <div className="w-4 h-4 rounded-full border border-gray-300 bg-[linear-gradient(45deg,#ccc_25%,transparent_25%),linear-gradient(-45deg,#ccc_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#ccc_75%),linear-gradient(-45deg,transparent_75%,#ccc_75%)] bg-[size:6px_6px]"></div>
                        <span>Transparent</span>
                      </button>

                      <button 
                        onClick={() => setSettings(prev => ({ ...prev, backgroundType: 'custom' }))}
                        className={`py-2.5 px-3 rounded-lg text-xs font-bold transition-all border flex flex-col items-center gap-1.5 cursor-pointer ${
                          settings.backgroundType === 'custom' 
                            ? 'border-blue-600 bg-blue-50/40 text-blue-700 font-extrabold shadow-xs' 
                            : 'border-gray-200 hover:border-gray-300 bg-white text-gray-700'
                        }`}
                        id="bgtype-custom"
                      >
                        <div 
                          className="w-4 h-4 rounded-full border border-white shadow-xs"
                          style={{ backgroundColor: settings.customBackgroundColor }}
                        ></div>
                        <span>Custom Picker</span>
                      </button>
                    </div>

                    {/* Color selector input */}
                    {settings.backgroundType === 'custom' && (
                      <div className="p-3 bg-gray-50 rounded-xl border border-gray-200 flex items-center justify-between gap-3 animate-fade-in">
                        <span className="text-xs font-medium text-gray-600">Select background color shade:</span>
                        <div className="flex items-center gap-2">
                          <input 
                            type="color" 
                            value={settings.customBackgroundColor}
                            onChange={(e) => setSettings(prev => ({ ...prev, customBackgroundColor: e.target.value }))}
                            className="w-8 h-8 rounded-lg cursor-pointer border-0 bg-transparent"
                          />
                          <input 
                            type="text" 
                            value={settings.customBackgroundColor.toUpperCase()}
                            onChange={(e) => setSettings(prev => ({ ...prev, customBackgroundColor: e.target.value }))}
                            className="w-20 px-2 py-1 text-xs font-mono uppercase bg-white border border-gray-300 rounded text-center"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* 2. RESOLUTION / CANVAS DIMENSIONS */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-gray-800 uppercase tracking-wider flex items-center gap-1">
                        <Ratio className="w-3.5 h-3.5 text-gray-500" />
                        <span>Resolution Constraints</span>
                      </label>

                      {/* Aspect Ratio Lock Toggle */}
                      <button 
                        onClick={() => {
                          setAspectRatioLock(!aspectRatioLock);
                          if (!aspectRatioLock) {
                            // Lock it using the current ratio
                            const curW = parseInt(widthInput) || 600;
                            const curH = parseInt(heightInput) || 800;
                            setAspectRatioValue(curW / curH);
                            triggerToast('Aspect ratio locked.');
                          } else {
                            triggerToast('Aspect ratio unlocked.');
                          }
                        }}
                        className={`text-[10px] font-bold px-2 py-1 rounded flex items-center gap-1.5 transition-all cursor-pointer ${
                          aspectRatioLock 
                            ? 'bg-blue-100 text-blue-700 border border-blue-200' 
                            : 'bg-gray-150 text-gray-500 border border-transparent'
                        }`}
                        id="aspect-ratio-lock-toggle"
                      >
                        <span>{aspectRatioLock ? '🔒 Ratio Locked' : '🔓 Freedom Mode'}</span>
                      </button>
                    </div>

                    {/* Numeric Dimension boxes */}
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <span className="text-[10px] text-gray-500 uppercase font-semibold">Width (px)</span>
                        <input 
                          type="number" 
                          value={widthInput}
                          onChange={(e) => handleDimensionChange(e.target.value, 'width')}
                          placeholder="Width"
                          min="50"
                          max="4000"
                          className="w-full px-3 py-2 text-sm bg-gray-50 border border-gray-300 rounded-lg text-gray-800 font-semibold focus:bg-white focus:ring-1 focus:ring-blue-500 focus:outline-none"
                        />
                      </div>

                      <div className="space-y-1">
                        <span className="text-[10px] text-gray-500 uppercase font-semibold">Height (px)</span>
                        <input 
                          type="number" 
                          value={heightInput}
                          onChange={(e) => handleDimensionChange(e.target.value, 'height')}
                          placeholder="Height"
                          min="50"
                          max="4000"
                          className="w-full px-3 py-2 text-sm bg-gray-50 border border-gray-300 rounded-lg text-gray-800 font-semibold focus:bg-white focus:ring-1 focus:ring-blue-500 focus:outline-none"
                        />
                      </div>
                    </div>

                    {/* Fitted Scaling options */}
                    <div className="flex gap-4 p-2 bg-gray-50 rounded-xl border border-gray-150 justify-between items-center text-xs">
                      <span className="font-bold text-gray-700">Scaling Fit:</span>
                      <div className="flex gap-2">
                        <button 
                          onClick={() => setSettings(prev => ({ ...prev, fitMode: 'contain' }))}
                          className={`px-2 py-1 rounded font-bold transition-all text-[11px] cursor-pointer ${
                            settings.fitMode === 'contain' 
                              ? 'bg-white text-blue-600 shadow-xs ring-1 ring-gray-200' 
                              : 'text-gray-500 hover:text-gray-800'
                          }`}
                        >
                          Fit Inside
                        </button>
                        <button 
                          onClick={() => setSettings(prev => ({ ...prev, fitMode: 'cover' }))}
                          className={`px-2 py-1 rounded font-bold transition-all text-[11px] cursor-pointer ${
                            settings.fitMode === 'cover' 
                              ? 'bg-white text-blue-600 shadow-xs ring-1 ring-gray-200' 
                              : 'text-gray-500 hover:text-gray-800'
                          }`}
                        >
                          Fill (Crop)
                        </button>
                        <button 
                          onClick={() => setSettings(prev => ({ ...prev, fitMode: 'stretch' }))}
                          className={`px-2 py-1 rounded font-bold transition-all text-[11px] cursor-pointer ${
                            settings.fitMode === 'stretch' 
                              ? 'bg-white text-blue-600 shadow-xs ring-1 ring-gray-200' 
                              : 'text-gray-500 hover:text-gray-800'
                          }`}
                        >
                          Stretch
                        </button>
                      </div>
                    </div>

                    {/* Presets Grid */}
                    <div className="space-y-1.5 pt-1">
                      <span className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Active Presets</span>
                      <div className="grid grid-cols-3 gap-2">
                        <button 
                          onClick={() => handlePreset(600, 800)}
                          className={`py-1.5 px-2 rounded-lg text-xs font-semibold border transition-all text-center cursor-pointer ${
                            settings.width === 600 && settings.height === 800 
                              ? 'border-blue-500 bg-blue-50 text-blue-700 font-bold' 
                              : 'border-gray-200 hover:border-gray-300 bg-white text-gray-600'
                          }`}
                        >
                          600 × 800 <span className="block text-[9px] text-gray-400 font-normal">(SaaS Default)</span>
                        </button>

                        <button 
                          onClick={() => handlePreset(800, 800)}
                          className={`py-1.5 px-2 rounded-lg text-xs font-semibold border transition-all text-center cursor-pointer ${
                            settings.width === 800 && settings.height === 800 
                              ? 'border-blue-500 bg-blue-50 text-blue-700 font-bold' 
                              : 'border-gray-200 hover:border-gray-300 bg-white text-gray-600'
                          }`}
                        >
                          800 × 800 <span className="block text-[9px] text-gray-400 font-normal">(Square aspect)</span>
                        </button>

                        <button 
                          onClick={() => handlePreset(1080, 1080)}
                          className={`py-1.5 px-2 rounded-lg text-xs font-semibold border transition-all text-center cursor-pointer ${
                            settings.width === 1080 && settings.height === 1080 
                              ? 'border-blue-500 bg-blue-50 text-blue-700 font-bold' 
                              : 'border-gray-200 hover:border-gray-300 bg-white text-gray-600'
                          }`}
                        >
                          1080 × 1080 <span className="block text-[9px] text-gray-400 font-normal">(Social HD)</span>
                        </button>

                        <button 
                          onClick={() => handlePreset(1200, 1600)}
                          className={`py-1.5 px-2 rounded-lg text-xs font-semibold border transition-all text-center col-span-3 cursor-pointer ${
                            settings.width === 1200 && settings.height === 1600 
                              ? 'border-blue-500 bg-blue-50 text-blue-700 font-bold' 
                              : 'border-gray-200 hover:border-gray-300 bg-white text-gray-600'
                          }`}
                        >
                          1200 × 1600 <span className="inline text-[9px] text-gray-400 font-normal ml-1">(2X Standard Resolution)</span>
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* 3. TARGET FILE SIZE / OPTIMIZATION WEIGHT */}
                  <div className="space-y-3">
                    <label className="text-xs font-bold text-gray-800 uppercase tracking-wider flex items-center justify-between">
                      <span>Maximum File Weight Limit</span>
                      {settings.backgroundType === 'transparent' && (
                        <span className="text-[10px] text-orange-500 bg-orange-50 px-1 py-0.5 rounded font-normal">
                          Requires solid background for JPG compression
                        </span>
                      )}
                    </label>

                    {/* Preset weight buttons */}
                    <div className="grid grid-cols-5 gap-1.5">
                      {[19, 20, 30, 50, 100].map((size) => (
                        <button 
                          key={size}
                          disabled={settings.backgroundType === 'transparent'}
                          onClick={() => handleTargetSizeChange(size.toString())}
                          className={`py-2 text-xs font-bold rounded-lg border transition-all cursor-pointer ${
                            settings.backgroundType === 'transparent'
                              ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
                              : settings.targetSizeKb === size 
                                ? 'border-blue-500 bg-blue-50 text-blue-700 font-extrabold shadow-xs' 
                                : 'border-gray-200 hover:border-gray-300 bg-white text-gray-600'
                          }`}
                        >
                          {size}K
                        </button>
                      ))}
                    </div>

                    {/* Custom Input */}
                    <div className="p-3 bg-gray-50 rounded-xl border border-gray-150 flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-bold text-gray-800">Custom target limits</p>
                        <p className="text-[10px] text-gray-400">Leave empty for unlimited quality</p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <input 
                          type="number" 
                          disabled={settings.backgroundType === 'transparent'}
                          value={targetSizeInput}
                          onChange={(e) => handleTargetSizeChange(e.target.value)}
                          placeholder="None"
                          min="1"
                          max="2000"
                          className="w-16 px-2 py-1 text-center font-semibold text-xs border border-gray-300 rounded focus:border-blue-500 focus:outline-none"
                        />
                        <span className="text-xs text-gray-500 font-bold">KB</span>
                      </div>
                    </div>
                  </div>

                  {/* RESET SETTINGS EXPLANATION */}
                  <div className="p-3.5 bg-yellow-50/70 border border-yellow-100 rounded-xl flex items-start gap-2.5 text-[11px] text-yellow-800 leading-relaxed">
                    <Info className="w-4 h-4 text-yellow-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold">Dynamic compression engine info:</span> The optimizer dynamically scales down Jpeg encoding properties (quantization matrix coefficients) to match size limit thresholds without reducing chosen dimensional frame.
                    </div>
                  </div>

                </div>

                {/* DOWNLOAD ACTIONS PANEL */}
                <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm space-y-4">
                  <div className="text-sm font-bold text-gray-900">
                    Ready to export?
                  </div>
                  <p className="text-xs text-gray-500 leading-relaxed">
                    Once satisfied, click the download button. The optimized copy will compile immediately and save to your desktop.
                  </p>

                  <button 
                    onClick={handleDownload}
                    className="w-full flex items-center justify-center gap-2.5 bg-blue-600 hover:bg-blue-700 text-white font-extrabold py-3.5 px-6 rounded-xl text-sm transition-all cursor-pointer shadow-md shadow-blue-500/20 hover:shadow-lg hover:shadow-blue-500/30 transform active:scale-98"
                    id="submit-download-button"
                  >
                    {isDownloading ? (
                      <>
                        <RefreshCw className="w-5 h-5 animate-spin" />
                        <span>Compiling final bundle...</span>
                      </>
                    ) : (
                      <>
                        <Download className="w-5 h-5" />
                        <span>Download Resized Image</span>
                      </>
                    )}
                  </button>
                  <p className="text-center text-[10px] text-gray-400 font-semibold uppercase">
                    Format: IMAGE_RESIZED_TIMESTAMP.JPG
                  </p>
                </div>

              </div>

            </div>
          )}
          </>
          )}

        </div>

      </main>

    </div>
  );
}
