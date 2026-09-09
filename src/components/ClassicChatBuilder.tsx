import React, { useState } from 'react';
import { Node, Edge } from '@xyflow/react';
import { validateFieldValue } from '../lib/validation';
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Bot,
  CalendarClock,
  Clock3,
  FileUp,
  Hash,
  Link2,
  MapPin,
  MessageCircleQuestion,
  SlidersHorizontal,
  Star,
  Video,
  CalendarDays,
  Check,
  CheckSquare,
  ChevronDown,
  Code,
  Copy,
  Eye,
  FileSpreadsheet,
  HelpCircle,
  Image as ImageIcon,
  Layers,
  LifeBuoy,
  ListChecks,
  Mail,
  MessageSquare,
  Palette,
  Phone,
  Plus,
  Save,
  Send,
  Sparkles,
  TextCursorInput,
  Trash2,
  TrendingUp,
  User,
  Wand2,
  X,
} from 'lucide-react';
import { BotDesignConfig, getDefaultDesignConfig } from '../types/design';
import BotDesignEditor from './BotDesignEditor';

interface ClassicChatBuilderProps {
  nodes: Node[];
  edges: Edge[];
  botName: string;
  setBotName: (name: string) => void;
  setNodes: (nodes: Node[] | ((prev: Node[]) => Node[])) => void;
  setEdges: (edges: Edge[] | ((prev: Edge[]) => Edge[])) => void;
  onSave: () => void;
  isSaving: boolean;
  onToggleMode: () => void;
  botSpreadsheetId?: string;
  setShowSheetsModal: (show: boolean) => void;
  setShowShareModal: (show: boolean) => void;
  setShowDeleteModal: (show: boolean) => void;
  botId?: string;
  showToast: (msg: string, type?: 'success' | 'error') => void;
  designConfig?: BotDesignConfig;
  setDesignConfig?: (config: BotDesignConfig) => void;
}

const EMOJI_PALETTE = [
  '👋', '😊', '🙂', '✨', '✅', '👍',
  '💬', '📞', '✉️', '📅', '📍', '🔗',
  '⭐', '🎉', '💡', '📌', '➡️', '❤️'
];

export default function ClassicChatBuilder({
  nodes,
  edges,
  botName,
  setBotName,
  setNodes,
  setEdges,
  onSave,
  isSaving,
  onToggleMode,
  botSpreadsheetId,
  setShowSheetsModal,
  setShowShareModal,
  setShowDeleteModal,
  botId,
  showToast,
  designConfig,
  setDesignConfig
}: ClassicChatBuilderProps) {
  const safeNodes = Array.isArray(nodes) ? nodes : (nodes && typeof nodes === 'object' ? Object.values(nodes) as Node[] : []);
  const safeEdges = Array.isArray(edges) ? edges : (edges && typeof edges === 'object' ? Object.values(edges) as Edge[] : []);

  const [activeBuilderTab, setActiveBuilderTab] = useState<'flow' | 'design'>('flow');
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(safeNodes[0]?.id || null);
  const [activeRightTab, setActiveRightTab] = useState<'customize' | 'advanced'>('customize');
  const [expandedCategories, setExpandedCategories] = useState<{ [key: string]: boolean }>({
    frequentlyUsed: true,
    requestInfo: false,
    sendInfo: false,
    decideAct: false
  });

  // Modal states
  const [showTestModal, setShowTestModal] = useState(false);
  const [showInstallModal, setShowInstallModal] = useState(false);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  // Test chat simulation state
  const [testMessages, setTestMessages] = useState<{ sender: 'bot' | 'user'; text: string; options?: string[]; image?: string }[]>([]);
  const [testCurrentStepIndex, setTestCurrentStepIndex] = useState(0);
  const [testUserInput, setTestUserInput] = useState('');

  const selectedNode = safeNodes.find(n => n.id === selectedNodeId) || safeNodes[0] || null;

  const toggleCategory = (cat: string) => {
    setExpandedCategories(prev => ({ ...prev, [cat]: !prev[cat] }));
  };

  const addComponentNode = (type: string, labelText?: string) => {
    const id = `node_${Date.now()}`;
    let defaultLabel = labelText || 'New Message';
    let key = '';

    if (type === 'message') defaultLabel = 'Welcome! Thanks for showing interest.';
    if (type === 'name') { defaultLabel = 'To start, could you share your full name with us?'; key = 'full_name'; }
    if (type === 'phone') { defaultLabel = 'Thanks! Could you also give us your phone number?'; key = 'phone_number'; }
    if (type === 'email') { defaultLabel = 'Perfect! Now please provide your email address so our team can reach out.'; key = 'email_address'; }
    if (type === 'singleChoice') defaultLabel = 'Please select an option below:';
    if (type === 'multipleChoice') defaultLabel = 'Select all that apply:';
    if (type === 'textQuestion') defaultLabel = 'What specific topic or service are you interested in?';
    if (type === 'aiResponse') defaultLabel = 'AI Assistant will answer customer query here...';
    if (type === 'image') defaultLabel = 'Check out this preview image!';
    if (type === 'file') defaultLabel = 'Please upload a file';
    if (type === 'location') defaultLabel = 'Please share your location';
    if (type === 'appointment') defaultLabel = 'Please select an appointment';
    if (type === 'dateTime') defaultLabel = 'Please select a date and time';
    if (type === 'rating') defaultLabel = 'How would you rate your experience?';
    if (type === 'range') defaultLabel = 'Please select a value';
    if (type === 'numericInput') defaultLabel = 'Please enter a number';
    if (type === 'smartQuestion') defaultLabel = 'Please answer this question';
    if (type === 'video') defaultLabel = 'Watch this video';
    if (type === 'webLink') defaultLabel = 'Open this link';

    const newNode: Node = {
      id,
      type,
      data: {
        label: defaultLabel,
        key: key,
        choices: (type === 'singleChoice' || type === 'multipleChoice') ? ['Option 1', 'Option 2'] : undefined,
        imageUrl: type === 'image' ? 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=600&auto=format&fit=crop&q=80' : undefined
      },
      position: { x: 250, y: (safeNodes.length + 1) * 120 }
    };

    setNodes(prev => [...(Array.isArray(prev) ? prev : []), newNode]);

    // Connect automatically from previous last node
    if (safeNodes.length > 0) {
      const lastNode = safeNodes[safeNodes.length - 1];
      const newEdge: Edge = {
        id: `e_${lastNode.id}-${id}`,
        source: lastNode.id,
        target: id,
        type: 'smoothstep'
      };
      setEdges(prev => [...(Array.isArray(prev) ? prev : []), newEdge]);
    }

    setSelectedNodeId(id);
    showToast('Component added to flow!');
  };

  const updateSelectedNodeData = (key: string, value: any) => {
    if (!selectedNodeId) return;
    setNodes(prev => (Array.isArray(prev) ? prev : []).map(n => {
      if (n.id === selectedNodeId) {
        return {
          ...n,
          data: {
            ...n.data,
            [key]: value
          }
        };
      }
      return n;
    }));
  };

  const deleteNode = (id: string) => {
    setNodes(prev => (Array.isArray(prev) ? prev : []).filter(n => n.id !== id));
    setEdges(prev => (Array.isArray(prev) ? prev : []).filter(e => e.source !== id && e.target !== id));
    if (selectedNodeId === id) {
      setSelectedNodeId(safeNodes.find(n => n.id !== id)?.id || null);
    }
    showToast('Step removed');
  };

  const moveNode = (index: number, direction: 'up' | 'down') => {
    if ((direction === 'up' && index === 0) || (direction === 'down' && index === safeNodes.length - 1)) return;
    const newNodes = [...safeNodes];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    const temp = newNodes[index];
    newNodes[index] = newNodes[targetIndex];
    newNodes[targetIndex] = temp;

    // Rebuild simple linear edges
    const newEdges: Edge[] = [];
    for (let i = 0; i < newNodes.length - 1; i++) {
      newEdges.push({
        id: `e_${newNodes[i].id}-${newNodes[i + 1].id}`,
        source: newNodes[i].id,
        target: newNodes[i + 1].id,
        type: 'smoothstep'
      });
    }
    setNodes(newNodes);
    setEdges(newEdges);
  };

  const appendEmoji = (emoji: string) => {
    if (!selectedNode) return;
    const currentText = (selectedNode.data?.label as string) || '';
    updateSelectedNodeData('label', currentText + ' ' + emoji);
  };

  const loadPresetTemplate = (templateType: string) => {
    let newNodes: Node[] = [];
    if (templateType === 'lead') {
      newNodes = [
        { id: 'node_1', type: 'message', data: { label: 'Welcome! Thanks for showing interest.\nWe’re thrilled to have you here.' }, position: { x: 250, y: 100 } },
        { id: 'node_2', type: 'message', data: { label: 'Let’s get you signed up.' }, position: { x: 250, y: 220 } },
        { id: 'node_3', type: 'name', data: { label: 'To start, could you share your full name with us?', key: 'full_name' }, position: { x: 250, y: 340 } },
        { id: 'node_4', type: 'phone', data: { label: 'Thanks! Could you also give us your phone number?\nWe’ll use it to send updates.', key: 'phone_number' }, position: { x: 250, y: 460 } },
        { id: 'node_5', type: 'email', data: { label: 'Perfect! Now, please provide your email address so our team can reach out.', key: 'email_address' }, position: { x: 250, y: 580 } },
      ];
    } else if (templateType === 'booking') {
      newNodes = [
        { id: 'node_1', type: 'message', data: { label: 'Hello! Welcome to our appointment booking assistant.' }, position: { x: 250, y: 100 } },
        { id: 'node_2', type: 'singleChoice', data: { label: 'What service are you looking to book today?', choices: ['Consultation Call', 'Product Demo', 'Support Session'] }, position: { x: 250, y: 220 } },
        { id: 'node_3', type: 'name', data: { label: 'Please enter your name so we can reserve your slot:', key: 'full_name' }, position: { x: 250, y: 340 } },
        { id: 'node_4', type: 'email', data: { label: 'Where should we send your booking confirmation?', key: 'email_address' }, position: { x: 250, y: 460 } },
      ];
    } else {
      newNodes = [
        { id: 'node_1', type: 'message', data: { label: 'Hi there! How can we assist you today?' }, position: { x: 250, y: 100 } },
        { id: 'node_2', type: 'textQuestion', data: { label: 'Please describe your query or issue in detail:', key: 'customer_query' }, position: { x: 250, y: 220 } },
        { id: 'node_3', type: 'email', data: { label: 'Leave your email address so our support team can reply:', key: 'email_address' }, position: { x: 250, y: 340 } },
      ];
    }

    const newEdges: Edge[] = [];
    for (let i = 0; i < newNodes.length - 1; i++) {
      newEdges.push({
        id: `e_${newNodes[i].id}-${newNodes[i + 1].id}`,
        source: newNodes[i].id,
        target: newNodes[i + 1].id,
        type: 'smoothstep'
      });
    }

    setNodes(newNodes);
    setEdges(newEdges);
    setSelectedNodeId(newNodes[0].id);
    setShowTemplateModal(false);
    showToast('Template imported successfully!');
  };

  const advanceTestNode = (nodeIndex: number, currentMessages: any[]) => {
    if (nodeIndex < 0 || nodeIndex >= safeNodes.length) return;
    const node = safeNodes[nodeIndex];
    setTestCurrentStepIndex(nodeIndex);

    const botMsg = {
      sender: 'bot' as const,
      text: (node.data?.label as string) || (node.data?.text as string) || '',
      options: node.data?.choices as string[],
      image: node.data?.imageUrl as string
    };
    const updatedMessages = [...currentMessages, botMsg];
    setTestMessages(updatedMessages);

    // Auto advance if node is non-interactive
    const isInteractive = ['name', 'email', 'phone', 'textQuestion', 'singleChoice', 'multipleChoice'].includes(node.type);
    if (!isInteractive) {
      let nextIndex = nodeIndex + 1;
      if (node.data?.nextStepId) {
        if (node.data.nextStepId === 'END') {
          return;
        }
        const foundIdx = safeNodes.findIndex(n => n.id === node.data.nextStepId);
        if (foundIdx !== -1) nextIndex = foundIdx;
      }
      if (nextIndex < safeNodes.length) {
        setTimeout(() => {
          advanceTestNode(nextIndex, updatedMessages);
        }, 750);
      }
    }
  };

  const startTestChat = () => {
    setShowTestModal(true);
    setTestCurrentStepIndex(0);
    setTestMessages([]);
    if (safeNodes.length > 0) {
      advanceTestNode(0, []);
    }
  };

  const handleTestUserReply = (replyText?: string) => {
    const textToSend = replyText || testUserInput;
    if (!textToSend.trim()) return;

    const currentStepNode = safeNodes[testCurrentStepIndex];

    if (currentStepNode) {
      const fieldLabel = (currentStepNode.data?.label as string) || (currentStepNode.data?.key as string) || 'Field';
      const fieldKey = (currentStepNode.data?.key as string) || currentStepNode.type;

      const val = validateFieldValue(currentStepNode.type, fieldKey, fieldLabel, textToSend);
      if (!val.isValid) {
        setTestMessages(prev => [
          ...prev,
          { sender: 'user' as const, text: textToSend },
          { sender: 'bot' as const, text: val.errorMsg || '⚠️ Please enter a valid response.' }
        ]);
        setTestUserInput('');
        return;
      }
    }

    const newMsgs = [...testMessages, { sender: 'user' as const, text: textToSend }];
    setTestUserInput('');

    let nextIndex = testCurrentStepIndex + 1;

    // Check optionRoutes, nextStepId or choice edges
    if (currentStepNode?.data?.optionRoutes && (currentStepNode.data.optionRoutes as Record<string, string>)[textToSend]) {
      const targetId = (currentStepNode.data.optionRoutes as Record<string, string>)[textToSend];
      const foundIdx = safeNodes.findIndex(n => n.id === targetId);
      if (foundIdx !== -1) {
        nextIndex = foundIdx;
      }
    } else if (currentStepNode?.data?.nextStepId) {
      if (currentStepNode.data.nextStepId === 'END') {
        nextIndex = -1;
      } else {
        const foundIdx = safeNodes.findIndex(n => n.id === currentStepNode.data.nextStepId);
        if (foundIdx !== -1) {
          nextIndex = foundIdx;
        }
      }
    } else {
      const choiceEdge = safeEdges.find(e => e.source === currentStepNode?.id && (e.label === textToSend || e.sourceHandle === textToSend));
      if (choiceEdge) {
        const foundIdx = safeNodes.findIndex(n => n.id === choiceEdge.target);
        if (foundIdx !== -1) {
          nextIndex = foundIdx;
        }
      }
    }

    if (nextIndex >= 0 && nextIndex < safeNodes.length) {
      setTimeout(() => {
        advanceTestNode(nextIndex, newMsgs);
      }, 500);
    } else {
      setTestMessages(newMsgs);
      setTimeout(() => {
        setTestMessages(prev => [...prev, {
          sender: 'bot',
          text: 'Thank you! You have completed the chatbot flow.'
        }]);
      }, 600);
    }
  };

  const getNodeIcon = (type: string) => {
    switch (type) {
      case 'image': return <ImageIcon />;
      case 'message': return <MessageSquare />;
      case 'name': return <User />;
      case 'phone': return <Phone />;
      case 'email': return <Mail />;
      case 'singleChoice': return <HelpCircle />;
      case 'multipleChoice': return <CheckSquare />;
      case 'textQuestion': return <TextCursorInput />;
      case 'aiResponse': return <Sparkles />;
      case 'file': return <FileUp />;
      case 'location': return <MapPin />;
      case 'appointment': return <CalendarClock />;
      case 'dateTime': return <Clock3 />;
      case 'rating': return <Star />;
      case 'range': return <SlidersHorizontal />;
      case 'numericInput': return <Hash />;
      case 'smartQuestion': return <MessageCircleQuestion />;
      case 'video': return <Video />;
      case 'webLink': return <Link2 />;
      default: return <MessageSquare />;
    }
  };

  const getNodeBg = (type: string) => {
    switch (type) {
      case 'image': return 'tone-pink';
      case 'name': return 'tone-green';
      case 'phone': return 'tone-green';
      case 'email': return 'tone-blue';
      case 'singleChoice': return 'tone-purple';
      case 'multipleChoice': return 'tone-purple';
      case 'textQuestion': return 'tone-orange';
      case 'aiResponse': return 'tone-pink';
      case 'file': return 'tone-yellow';
      case 'location': return 'tone-red';
      case 'appointment': return 'tone-blue';
      case 'dateTime': return 'tone-orange';
      case 'rating': return 'tone-yellow';
      case 'range': return 'tone-blue';
      case 'numericInput': return 'tone-blue';
      case 'smartQuestion': return 'tone-orange';
      case 'video': return 'tone-red';
      case 'webLink': return 'tone-green';
      default: return 'tone-blue';
    }
  };

  const isInputNode = (type: string) => {
    return ['name', 'phone', 'email', 'singleChoice', 'multipleChoice', 'textQuestion', 'file', 'location', 'appointment', 'dateTime', 'rating', 'range', 'numericInput', 'smartQuestion'].includes(type);
  };

  const getAppBaseUrl = () => {
    if (typeof window === 'undefined') return 'https://akanksha-1007.github.io/mintage-bot';
    const origin = window.location.origin;
    const baseUrl = import.meta.env.BASE_URL || '/';
    const cleanBase = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
    return origin + cleanBase;
  };
  const activeOrigin = getAppBaseUrl();

  const activeColor = encodeURIComponent((designConfig && (designConfig.accentColor || designConfig.headerBgColor)) || '#5B3DF5');
  const activePos = (designConfig && designConfig.launcherPosition === 'bottom-left') ? 'left' : 'right';
  const embedScriptCode = `<script src="${activeOrigin}/widget.js" data-bot-id="${botId || 'demo_bot_id'}" data-color="${activeColor}" data-position="${activePos}" async></script>`;
  const embedIframeCode = `<iframe src="${activeOrigin}/widget/${botId || 'demo_bot_id'}" width="380" height="600" style="border:none; border-radius:16px; box-shadow:0 10px 30px rgba(0,0,0,0.15);"></iframe>`;

  return (
    <div className="classic-builder">
      <header className="builder-toolbar">
        <div className="min-w-0">
          <input
            type="text"
            value={botName}
            onChange={(e) => setBotName(e.target.value)}
            className="builder-title-input"
            placeholder="Untitled bot"
            aria-label="Bot name"
          />
          <p className="builder-subtitle">Edit your chat flow</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Main Tab Switcher: Flow vs Design */}
          <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 mr-2">
            <button
              onClick={() => setActiveBuilderTab('flow')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 ${activeBuilderTab === 'flow' ? 'bg-white text-indigo-600 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Chat Flow</span>
            </button>

            <button
              onClick={() => setActiveBuilderTab('design')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 ${activeBuilderTab === 'design' ? 'bg-white text-indigo-600 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
            >
              <Palette className="w-3.5 h-3.5 text-pink-500" />
              <span>Custom Design</span>
            </button>
          </div>

          <button
            onClick={onToggleMode}
            className="button-secondary"
            title="Switch to the node canvas builder"
          >
            <Layers />
            <span>Visualise flow</span>
          </button>

          <button onClick={() => setShowTemplateModal(true)} className="button-secondary">
            <Wand2 />
            <span>Template</span>
          </button>

          <button onClick={startTestChat} className="button-secondary">
            <Eye />
            <span>Test</span>
          </button>

          <button onClick={() => setShowInstallModal(true)} className="button-secondary">
            <Code />
            <span>Install</span>
          </button>

          <button onClick={() => setShowSheetsModal(true)} className="button-secondary">
            <FileSpreadsheet />
            <span>{botSpreadsheetId ? 'Sheet linked' : 'Sheet'}</span>
          </button>

          <button onClick={onSave} disabled={isSaving} className="button-primary">
            <Save />
            <span>{isSaving ? 'Saving…' : 'Save'}</span>
          </button>
        </div>
      </header>

      {/* Main Content Area: Tabbed rendering */}
      {activeBuilderTab === 'design' ? (
        <BotDesignEditor
          designConfig={designConfig || getDefaultDesignConfig()}
          onChange={setDesignConfig || (() => { })}
          botName={botName}
        />
      ) : (
        /* 3 Column Main Area */
        <div className="flex-1 flex overflow-hidden">
          {/* ================= COLUMN 1: Add Chat Component ================= */}
          <div className="builder-library">
            <div className="builder-panel-head">Add chat component</div>

            <div className="builder-scroll">
              {/* Category: Frequently Used */}
              <div className="builder-group">
                <button
                  onClick={() => toggleCategory('frequentlyUsed')}
                  className="builder-group-toggle"
                >
                  <span>Frequently used</span>
                  <ChevronDown style={{ transform: expandedCategories.frequentlyUsed ? 'none' : 'rotate(-90deg)' }} />
                </button>

                {expandedCategories.frequentlyUsed && (
                  <div className="builder-group-body">
                    <button
                      onClick={() => addComponentNode('message')}
                      className="component-tile"
                    >
                      <span className="icon-tile tone-blue"><MessageSquare /></span>
                      <span>Message</span>
                    </button>

                    <button
                      onClick={() => addComponentNode('name')}
                      className="component-tile"
                    >
                      <span className="icon-tile tone-green"><User /></span>
                      <span>Name</span>
                    </button>

                    <button
                      onClick={() => addComponentNode('phone')}
                      className="component-tile"
                    >
                      <span className="icon-tile tone-green"><Phone /></span>
                      <span>Phone Number</span>
                    </button>

                    <button
                      onClick={() => addComponentNode('email')}
                      className="component-tile"
                    >
                      <span className="icon-tile tone-blue"><Mail /></span>
                      <span>Email</span>
                    </button>

                    <button
                      onClick={() => addComponentNode('singleChoice')}
                      className="component-tile"
                    >
                      <span className="icon-tile tone-purple"><CheckSquare /></span>
                      <span>Single Choice</span>
                    </button>

                    <button
                      onClick={() => addComponentNode('multipleChoice')}
                      className="component-tile"
                    >
                      <span className="icon-tile tone-purple"><ListChecks /></span>
                      <span>Multiple Choice</span>
                    </button>

                    <button
                      onClick={() => addComponentNode('textQuestion')}
                      className="component-tile"
                    >
                      <span className="icon-tile tone-orange"><TextCursorInput /></span>
                      <span>Text Question</span>
                    </button>

                    <button
                      onClick={() => addComponentNode('aiResponse')}
                      className="component-tile"
                    >
                      <span className="icon-tile tone-pink"><Sparkles /></span>
                      <span>AI Responses</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Category: Request Information */}
              <div className="builder-group">
                <button
                  onClick={() => toggleCategory('requestInfo')}
                  className="builder-group-toggle"
                >
                  <span>Request Information</span>
                  <ChevronDown style={{ transform: expandedCategories.requestInfo ? 'none' : 'rotate(-90deg)' }} />
                </button>
                {expandedCategories.requestInfo && (
                  <div className="builder-group-body">
                    <button onClick={() => addComponentNode('name')} className="component-tile-plain">Name input</button>
                    <button onClick={() => addComponentNode('phone')} className="component-tile-plain">Phone input</button>
                    <button onClick={() => addComponentNode('email')} className="component-tile-plain">Email input</button>
                    <button onClick={() => addComponentNode('file')} className="component-tile-plain">File upload</button>
                    <button onClick={() => addComponentNode('location')} className="component-tile-plain">Location</button>
                    <button onClick={() => addComponentNode('appointment')} className="component-tile-plain">Appointment</button>
                    <button onClick={() => addComponentNode('dateTime')} className="component-tile-plain">Date &amp; Time</button>
                    <button onClick={() => addComponentNode('rating')} className="component-tile-plain">Rating</button>
                    <button onClick={() => addComponentNode('range')} className="component-tile-plain">Range</button>
                    <button onClick={() => addComponentNode('numericInput')} className="component-tile-plain">Numeric input</button>
                    <button onClick={() => addComponentNode('smartQuestion')} className="component-tile-plain">Smart question</button>
                  </div>
                )}
              </div>

              {/* Category: Send Information */}
              <div className="builder-group">
                <button
                  onClick={() => toggleCategory('sendInfo')}
                  className="builder-group-toggle"
                >
                  <span>Send Information</span>
                  <ChevronDown style={{ transform: expandedCategories.sendInfo ? 'none' : 'rotate(-90deg)' }} />
                </button>
                {expandedCategories.sendInfo && (
                  <div className="builder-group-body">
                    <button onClick={() => addComponentNode('message')} className="component-tile-plain">Bot message</button>
                    <button onClick={() => addComponentNode('image')} className="component-tile-plain">Image / GIF</button>
                    <button onClick={() => addComponentNode('video')} className="component-tile-plain">Video</button>
                    <button onClick={() => addComponentNode('webLink')} className="component-tile-plain">Web Link</button>
                  </div>
                )}
              </div>

              {/* Category: Decide and Act */}
              <div className="builder-group">
                <button
                  onClick={() => toggleCategory('decideAct')}
                  className="builder-group-toggle"
                >
                  <span>Decide and Act</span>
                  <ChevronDown style={{ transform: expandedCategories.decideAct ? 'none' : 'rotate(-90deg)' }} />
                </button>
                {expandedCategories.decideAct && (
                  <div className="builder-group-body">
                    <button onClick={() => addComponentNode('singleChoice')} className="component-tile-plain">Branch by choice</button>
                    <button onClick={() => addComponentNode('aiResponse')} className="component-tile-plain">AI smart answer</button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ================= COLUMN 2: Create/Reorder Chat Flow ================= */}
          <div className="classic-canvas">
            <div className="builder-panel-head sticky top-0 z-10">Create &amp; reorder chat flow</div>

            <div className="classic-canvas-inner">
              {safeNodes.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-icon"><MessageSquare /></div>
                  <h3>Your chat flow is empty</h3>
                  <p>Pick a component from the left sidebar to add bot messages and questions.</p>
                  <button onClick={() => addComponentNode('message')} className="button-primary">
                    <Plus />
                    Add a welcome message
                  </button>
                </div>
              ) : (
                safeNodes.map((node, index) => {
                  const isSelected = selectedNodeId === node.id;
                  const nodeLabel = (node.data?.label as string) || '';
                  const imageUrl = node.data?.imageUrl as string;
                  const choices = node.data?.choices as string[];
                  const showUserReplyTag = isInputNode(node.type);

                  return (
                    <div
                      key={node.id}
                      onClick={() => setSelectedNodeId(node.id)}
                      className={`flow-step ${isSelected ? 'is-selected' : ''}`}
                    >
                      {/* Step icon */}
                      <div className={`flow-step-avatar ${getNodeBg(node.type)}`}>
                        {getNodeIcon(node.type)}
                      </div>

                      {/* Step card */}
                      <div className="flow-step-card">
                        {/* Image preview if exists */}
                        {imageUrl && (
                          <div className="flow-step-media">
                            <img src={imageUrl} alt="" className="h-full w-full object-cover" />
                          </div>
                        )}

                        {/* Text label */}
                        <p>{nodeLabel}</p>

                        {/* Choice options preview if single/multiple choice */}
                        {choices && choices.length > 0 && (
                          <div className="flow-step-choices">
                            {choices.map((choice, idx) => {
                              const targetId = (node.data?.optionRoutes as Record<string, string>)?.[choice];
                              const targetIndex = targetId ? safeNodes.findIndex(n => n.id === targetId) : -1;
                              const targetNode = targetIndex !== -1 ? safeNodes[targetIndex] : null;

                              return (
                                <span key={idx} className="tag">
                                  <span>{choice}</span>
                                  {targetNode ? (
                                    <span className="text-faint inline-flex items-center gap-1">
                                      <ArrowRight className="h-3 w-3" />
                                      Step {targetIndex + 1}
                                    </span>
                                  ) : (
                                    <span className="text-faint inline-flex items-center gap-1">
                                      <ArrowRight className="h-3 w-3" />
                                      Next
                                    </span>
                                  )}
                                </span>
                              );
                            })}
                          </div>
                        )}

                        {/* Next Step / Redirection Indicator Footer */}
                        <div className="flow-step-footer">
                          <span>Next step</span>
                          {node.data?.nextStepId === 'END' ? (
                            <span className="tag tone-red"><X />End chat flow</span>
                          ) : node.data?.nextStepId ? (() => {
                            const targetIdx = safeNodes.findIndex(n => n.id === node.data.nextStepId);
                            const targetNode = targetIdx !== -1 ? safeNodes[targetIdx] : null;
                            return targetNode ? (
                              <span className="tag tone-blue">
                                <ArrowRight />
                                Step {targetIdx + 1}: {((targetNode.data?.label as string) || targetNode.type).slice(0, 20)}
                              </span>
                            ) : (
                              <span className="tag"><ArrowRight />Next</span>
                            );
                          })() : index < safeNodes.length - 1 ? (
                            <span className="tag"><ArrowRight />Step {index + 2} (default)</span>
                          ) : (
                            <span className="tag tone-yellow"><Check />End of flow</span>
                          )}
                        </div>
                      </div>

                      {/* Blue User Reply Badge on the right */}
                      {showUserReplyTag && <span className="user-reply-chip">User reply</span>}

                      {/* Action buttons (Move Up, Move Down, Delete) */}
                      <div className="flow-step-tools">
                        <button
                          onClick={(e) => { e.stopPropagation(); moveNode(index, 'up'); }}
                          disabled={index === 0}
                          className="icon-button"
                          title="Move up"
                        >
                          <ArrowUp />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); moveNode(index, 'down'); }}
                          disabled={index === safeNodes.length - 1}
                          className="icon-button"
                          title="Move down"
                        >
                          <ArrowDown />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); deleteNode(node.id); }}
                          className="icon-button danger"
                          title="Delete step"
                        >
                          <Trash2 />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}

              {/* Bottom Add Component Quick Bar */}
              <div style={{ marginTop: '18px' }}>
                <button onClick={() => addComponentNode('message')} className="add-dashed">
                  <Plus />
                  <span>Add component to flow</span>
                </button>
              </div>
            </div>
          </div>

          {/* ================= COLUMN 3: Customize Bot Messages ================= */}
          <div className="builder-properties">
            <div className="builder-panel-head">Customize bot messages</div>

            {selectedNode ? (
              <div className="flex flex-1 flex-col">
                <div className="sub-tabs">
                  <button
                    onClick={() => setActiveRightTab('customize')}
                    className={activeRightTab === 'customize' ? 'is-active' : ''}
                  >
                    Customize
                  </button>
                  <button
                    onClick={() => setActiveRightTab('advanced')}
                    className={activeRightTab === 'advanced' ? 'is-active' : ''}
                  >
                    Advanced
                  </button>
                </div>

                {activeRightTab === 'customize' ? (
                  <div className="builder-scroll flex flex-col gap-4">
                    {/* Message */}
                    <div>
                      <label className="field-label">Message</label>
                      <textarea
                        rows={4}
                        value={(selectedNode.data?.label as string) || ''}
                        onChange={(e) => updateSelectedNodeData('label', e.target.value)}
                        className="textarea"
                        placeholder="Welcome! Thanks for showing interest."
                      />
                    </div>

                    {/* Media */}
                    <div>
                      <label className="field-label">GIF or image URL</label>
                      <input
                        type="text"
                        value={(selectedNode.data?.imageUrl as string) || ''}
                        onChange={(e) => updateSelectedNodeData('imageUrl', e.target.value)}
                        className="input"
                        placeholder="https://example.com/media.gif"
                      />
                    </div>

                    {/* Emoji picker */}
                    <div>
                      <label className="field-label">Add an emoji</label>
                      <div className="emoji-picker-grid">
                        {EMOJI_PALETTE.map((emoji, i) => (
                          <button
                            key={i}
                            type="button"
                            onClick={() => appendEmoji(emoji)}
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Next step */}
                    <div className="modal-section" style={{ marginTop: 0 }}>
                      <p className="modal-section-title" style={{ justifyContent: 'space-between' }}>
                        <span>Next step</span>
                        <span className="tag">Step flow</span>
                      </p>
                      <p className="field-hint" style={{ marginBottom: '8px', marginTop: 0 }}>
                        Select which step follows this component.
                      </p>
                      <select
                        value={(selectedNode.data?.nextStepId as string) || ''}
                        onChange={(e) => {
                          const targetId = e.target.value;
                          updateSelectedNodeData('nextStepId', targetId);

                          // Sync ReactFlow edge
                          let updatedEdges = (Array.isArray(edges) ? edges : []).filter(ed => ed.source !== selectedNode.id || ed.sourceHandle);
                          if (targetId && targetId !== 'END') {
                            updatedEdges.push({
                              id: `e_${selectedNode.id}-${targetId}`,
                              source: selectedNode.id,
                              target: targetId,
                              type: 'smoothstep',
                              style: { stroke: '#7B4DFF', strokeWidth: 2 }
                            });
                          }
                          setEdges(updatedEdges);
                        }}
                        className="select"
                      >
                        <option value="">Default next step (sequential)</option>
                        <option value="END">End chat flow here</option>
                        {safeNodes.filter(n => n.id !== selectedNode.id).map((n) => {
                          const stepIndex = safeNodes.findIndex(sn => sn.id === n.id) + 1;
                          const label = (n.data?.label as string) || n.type;
                          return (
                            <option key={n.id} value={n.id}>
                              Step #{stepIndex}: {label.length > 25 ? label.slice(0, 25) + '...' : label}
                            </option>
                          );
                        })}
                      </select>
                    </div>

                    {/* Options Editor for Choice Nodes */}
                    {(selectedNode.type === 'singleChoice' || selectedNode.type === 'multipleChoice') && (
                      <div className="modal-section">
                        <p className="modal-section-title">Options &amp; redirection</p>
                        <p className="field-hint" style={{ marginBottom: '10px', marginTop: 0 }}>
                          Choose which step each option redirects the user to.
                        </p>

                        <div>
                          {((selectedNode.data?.choices as string[]) || []).map((choice, idx) => {
                            const currentRoute = (selectedNode.data?.optionRoutes as Record<string, string>)?.[choice] || '';

                            return (
                              <div key={idx} className="choice-editor">
                                <div className="flex items-center gap-2">
                                  <input
                                    type="text"
                                    value={choice}
                                    onChange={(e) => {
                                      const newChoiceName = e.target.value;
                                      const oldChoices = [...((selectedNode.data?.choices as string[]) || [])];
                                      oldChoices[idx] = newChoiceName;

                                      const oldRoutes = { ...((selectedNode.data?.optionRoutes as Record<string, string>) || {}) };
                                      if (oldRoutes[choice] && choice !== newChoiceName) {
                                        oldRoutes[newChoiceName] = oldRoutes[choice];
                                        delete oldRoutes[choice];
                                      }

                                      setNodes(prev => (Array.isArray(prev) ? prev : []).map(n => {
                                        if (n.id === selectedNode.id) {
                                          return {
                                            ...n,
                                            data: {
                                              ...n.data,
                                              choices: oldChoices,
                                              optionRoutes: oldRoutes
                                            }
                                          };
                                        }
                                        return n;
                                      }));
                                    }}
                                    className="input compact"
                                    placeholder="Option text"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const newChoices = ((selectedNode.data?.choices as string[]) || []).filter((_, i) => i !== idx);
                                      const oldRoutes = { ...((selectedNode.data?.optionRoutes as Record<string, string>) || {}) };
                                      delete oldRoutes[choice];

                                      setNodes(prev => (Array.isArray(prev) ? prev : []).map(n => {
                                        if (n.id === selectedNode.id) {
                                          return {
                                            ...n,
                                            data: {
                                              ...n.data,
                                              choices: newChoices,
                                              optionRoutes: oldRoutes
                                            }
                                          };
                                        }
                                        return n;
                                      }));
                                    }}
                                    className="icon-button danger"
                                    title="Remove option"
                                  >
                                    <X />
                                  </button>
                                </div>

                                <div className="choice-editor-route">
                                  <span>Go to</span>
                                  <select
                                    value={currentRoute}
                                    onChange={(e) => {
                                      const targetId = e.target.value;
                                      const oldRoutes = { ...((selectedNode.data?.optionRoutes as Record<string, string>) || {}) };
                                      if (targetId) {
                                        oldRoutes[choice] = targetId;
                                      } else {
                                        delete oldRoutes[choice];
                                      }

                                      setNodes(prev => (Array.isArray(prev) ? prev : []).map(n => {
                                        if (n.id === selectedNode.id) {
                                          return {
                                            ...n,
                                            data: {
                                              ...n.data,
                                              optionRoutes: oldRoutes
                                            }
                                          };
                                        }
                                        return n;
                                      }));

                                      // Sync edge for visual canvas
                                      let updatedEdges = (Array.isArray(edges) ? edges : []).filter(ed => !(ed.source === selectedNode.id && (ed.label === choice || ed.sourceHandle === choice)));
                                      if (targetId) {
                                        updatedEdges.push({
                                          id: `e_${selectedNode.id}_${choice}_${targetId}`,
                                          source: selectedNode.id,
                                          target: targetId,
                                          label: choice,
                                          sourceHandle: choice,
                                          type: 'smoothstep'
                                        });
                                      }
                                      setEdges(updatedEdges);
                                    }}
                                    className="select compact"
                                  >
                                    <option value="">Default next step</option>
                                    {safeNodes.filter(n => n.id !== selectedNode.id).map((n) => {
                                      const stepNum = safeNodes.findIndex(sn => sn.id === n.id) + 1;
                                      const label = (n.data?.label as string) || n.type;
                                      return (
                                        <option key={n.id} value={n.id}>
                                          Step #{stepNum}: {label.length > 22 ? label.slice(0, 22) + '...' : label}
                                        </option>
                                      );
                                    })}
                                  </select>
                                </div>
                              </div>
                            );
                          })}
                          <button
                            type="button"
                            onClick={() => {
                              const newChoices = [...((selectedNode.data?.choices as string[]) || []), `Option ${((selectedNode.data?.choices as string[]) || []).length + 1}`];
                              updateSelectedNodeData('choices', newChoices);
                            }}
                            className="add-dashed"
                            style={{ marginTop: '8px' }}
                          >
                            <Plus /> Add choice
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  /* Advanced Tab */
                  <div className="builder-scroll flex flex-col gap-4">
                    <div>
                      <label className="field-label">Lead key variable</label>
                      <input
                        type="text"
                        value={(selectedNode.data?.key as string) || ''}
                        onChange={(e) => updateSelectedNodeData('key', e.target.value)}
                        className="input input-mono"
                        placeholder="full_name, phone, email"
                      />
                      <p className="field-hint">Records lead answers into your database and Google Sheets under this key.</p>
                    </div>

                    <div className="modal-section">
                      <button onClick={() => deleteNode(selectedNode.id)} className="button-danger button-block">
                        <Trash2 /> Delete component
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="builder-scroll">
                <div className="empty-state">
                  <div className="empty-icon"><Sparkles /></div>
                  <h4>Nothing selected</h4>
                  <p>Pick a step in the flow to customize its text, media and routing.</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ================= MODAL: Test Chat Flow ================= */}
      {showTestModal && (
        <div className="modal-backdrop">
          <div className="transcript-modal" style={{ maxWidth: '390px', height: 'min(80vh, 620px)' }}>
            {/* Header */}
            <div className="chat-widget-header">
              <span className="icon-tile"><Bot /></span>
              <div className="min-w-0 flex-1">
                <h3 className="truncate">{botName}</h3>
                <div className="chat-widget-status"><i /><span>Live simulator</span></div>
              </div>
              <button onClick={() => setShowTestModal(false)} className="icon-button" aria-label="Close">
                <X />
              </button>
            </div>

            {/* Chat body */}
            <div className="chat-log">
              {testMessages.map((msg, i) => (
                <div key={i} className={`chat-row ${msg.sender === 'user' ? 'is-user' : 'is-bot'}`}>
                  <div className="min-w-0">
                    <div className="chat-bubble">
                      {msg.image && (
                        <img src={msg.image} alt="" className="chat-bubble-media" />
                      )}
                      <p>{msg.text}</p>
                    </div>

                    {msg.options && (
                      <div className="chat-choices">
                        {msg.options.map((opt, oIdx) => (
                          <button
                            key={oIdx}
                            onClick={() => handleTestUserReply(opt)}
                            className="chat-choice"
                          >
                            <span>{opt}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Input bar */}
            <div className="chat-composer">
              <input
                type="text"
                value={testUserInput}
                onChange={(e) => setTestUserInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleTestUserReply()}
                placeholder="Type a message…"
                className="input"
                aria-label="Test message"
              />
              <button
                onClick={() => handleTestUserReply()}
                className="chat-send"
                aria-label="Send"
              >
                <Send />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL: Install Embed Widget ================= */}
      {showInstallModal && (
        <div className="modal-backdrop">
          <div className="app-modal is-md">
            <div className="modal-head">
              <div className="modal-head-main">
                <span className="icon-tile tile-lg tone-blue"><Code /></span>
                <div>
                  <h3>Install chatbot widget</h3>
                  <p>Paste this snippet before the &lt;/body&gt; tag on your website.</p>
                </div>
              </div>
              <button onClick={() => setShowInstallModal(false)} className="icon-button" aria-label="Close">
                <X />
              </button>
            </div>

            <div className="flex flex-col gap-5">
              <div>
                <p className="modal-section-title">Option 1 · Floating chat bubble</p>
                <div className="code-block">
                  <pre>{embedScriptCode}</pre>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(embedScriptCode);
                      setCopiedCode(true);
                      setTimeout(() => setCopiedCode(false), 2000);
                    }}
                    className="button-secondary compact absolute right-2 top-2"
                  >
                    {copiedCode ? <Check /> : <Copy />}
                    <span>{copiedCode ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
                <p className="field-hint">Works on HTML, WordPress, Webflow, Shopify and React sites.</p>
              </div>

              <div>
                <p className="modal-section-title">Option 2 · Inline iframe</p>
                <div className="code-block">
                  <pre>{embedIframeCode}</pre>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(embedIframeCode);
                      setCopiedCode(true);
                      setTimeout(() => setCopiedCode(false), 2000);
                    }}
                    className="button-secondary compact absolute right-2 top-2"
                  >
                    {copiedCode ? <Check /> : <Copy />}
                    <span>{copiedCode ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
                <p className="field-hint">Best for embedding inside an existing page layout.</p>
              </div>
            </div>

            <div className="modal-actions is-end">
              <button onClick={() => setShowInstallModal(false)} className="button-secondary">
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL: Import Template ================= */}
      {showTemplateModal && (
        <div className="modal-backdrop">
          <div className="app-modal">
            <div className="modal-head">
              <div>
                <h3>Import a template</h3>
                <p>Start from a pre-built chat sequence.</p>
              </div>
              <button onClick={() => setShowTemplateModal(false)} className="icon-button" aria-label="Close">
                <X />
              </button>
            </div>

            <div className="flex flex-col gap-2">
              <button onClick={() => loadPresetTemplate('lead')} className="conversation-row">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="icon-tile tone-blue"><TrendingUp /></span>
                  <div className="min-w-0 text-left">
                    <strong>Lead generation</strong>
                    <p>Welcomes visitors, then collects name, phone and email.</p>
                  </div>
                </div>
              </button>

              <button onClick={() => loadPresetTemplate('booking')} className="conversation-row">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="icon-tile tone-green"><CalendarDays /></span>
                  <div className="min-w-0 text-left">
                    <strong>Appointment booking</strong>
                    <p>Asks for a service choice, name and booking email.</p>
                  </div>
                </div>
              </button>

              <button onClick={() => loadPresetTemplate('support')} className="conversation-row">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="icon-tile tone-purple"><LifeBuoy /></span>
                  <div className="min-w-0 text-left">
                    <strong>Support &amp; FAQ</strong>
                    <p>Collects a detailed issue description and contact details.</p>
                  </div>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
