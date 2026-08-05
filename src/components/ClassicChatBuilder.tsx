import React, { useState } from 'react';
import { Node, Edge } from '@xyflow/react';
import { 
  MessageSquare, User, Phone, Mail, CheckSquare, HelpCircle, 
  Sparkles, Image as ImageIcon, ChevronDown, ChevronRight, 
  Trash2, ArrowUp, ArrowDown, Plus, Eye, Code, FileText, 
  Save, Share2, FileSpreadsheet, Check, Copy, X, Wand2, Layers,
  Send, Bot
} from 'lucide-react';

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
}

const EMOJI_PALETTE = [
  '👋', '🚀', '🤖', '✨', '🔥', '😇', '😎', '😍', '😊', '👏', 
  '👍', '😄', '🤐', '🙋', '🤩', '💪', '🤷', '👱', '🤞', '👧', 
  '👎', '🧸', '🟢', '😃', '🖐', '👈', '👉', '🛫', '⏰', '🎉', 
  '💬', '📞', '✉️', '⭐', '❤️', '📍'
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
  showToast
}: ClassicChatBuilderProps) {
  const safeNodes = Array.isArray(nodes) ? nodes : (nodes && typeof nodes === 'object' ? Object.values(nodes) as Node[] : []);
  const safeEdges = Array.isArray(edges) ? edges : (edges && typeof edges === 'object' ? Object.values(edges) as Edge[] : []);

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

    if (type === 'message') defaultLabel = 'Welcome! Thanks for showing interest! 🚀';
    if (type === 'name') { defaultLabel = 'To start, could you share your full name with us? ✨'; key = 'full_name'; }
    if (type === 'phone') { defaultLabel = 'Thanks! Could you also give us your phone number? 📞'; key = 'phone_number'; }
    if (type === 'email') { defaultLabel = 'Perfect! Now please provide your email address so our team can reach out! ✉️'; key = 'email_address'; }
    if (type === 'singleChoice') defaultLabel = 'Please select an option below:';
    if (type === 'multipleChoice') defaultLabel = 'Select all that apply:';
    if (type === 'textQuestion') defaultLabel = 'What specific topic or service are you interested in?';
    if (type === 'aiResponse') defaultLabel = 'AI Assistant will answer customer query here...';
    if (type === 'image') defaultLabel = 'Check out this preview image!';

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
        { id: 'node_1', type: 'message', data: { label: 'Welcome! Thanks for showing interest! 🚀\nWe’re thrilled to have you here.' }, position: { x: 250, y: 100 } },
        { id: 'node_2', type: 'message', data: { label: 'Let’s get you signed up! 🎉' }, position: { x: 250, y: 220 } },
        { id: 'node_3', type: 'name', data: { label: 'To start, could you share your full name with us? ✨', key: 'full_name' }, position: { x: 250, y: 340 } },
        { id: 'node_4', type: 'phone', data: { label: 'Thanks! 📞 Could you also give us your phone number?\nWe’ll use it to send updates.', key: 'phone_number' }, position: { x: 250, y: 460 } },
        { id: 'node_5', type: 'email', data: { label: 'Perfect! 🌐 Now, please provide your email address so our team can reach out! 📧', key: 'email_address' }, position: { x: 250, y: 580 } },
      ];
    } else if (templateType === 'booking') {
      newNodes = [
        { id: 'node_1', type: 'message', data: { label: 'Hello! 👋 Welcome to our appointment booking assistant.' }, position: { x: 250, y: 100 } },
        { id: 'node_2', type: 'singleChoice', data: { label: 'What service are you looking to book today?', choices: ['Consultation Call', 'Product Demo', 'Support Session'] }, position: { x: 250, y: 220 } },
        { id: 'node_3', type: 'name', data: { label: 'Please enter your name so we can reserve your slot:', key: 'full_name' }, position: { x: 250, y: 340 } },
        { id: 'node_4', type: 'email', data: { label: 'Where should we send your booking confirmation?', key: 'email_address' }, position: { x: 250, y: 460 } },
      ];
    } else {
      newNodes = [
        { id: 'node_1', type: 'message', data: { label: 'Hi there! 👋 How can we assist you today?' }, position: { x: 250, y: 100 } },
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

    const newMsgs = [...testMessages, { sender: 'user' as const, text: textToSend }];
    setTestUserInput('');

    const currentStepNode = safeNodes[testCurrentStepIndex];
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
          text: '🎉 Thank you! You have completed the chatbot flow.'
        }]);
      }, 600);
    }
  };

  const getNodeIcon = (type: string) => {
    switch (type) {
      case 'image': return <ImageIcon className="w-4 h-4 text-pink-600" />;
      case 'message': return <MessageSquare className="w-4 h-4 text-indigo-600" />;
      case 'name': return <User className="w-4 h-4 text-blue-600" />;
      case 'phone': return <Phone className="w-4 h-4 text-teal-600" />;
      case 'email': return <Mail className="w-4 h-4 text-amber-600" />;
      case 'singleChoice': return <HelpCircle className="w-4 h-4 text-purple-600" />;
      case 'multipleChoice': return <CheckSquare className="w-4 h-4 text-emerald-600" />;
      case 'textQuestion': return <HelpCircle className="w-4 h-4 text-cyan-600" />;
      case 'aiResponse': return <Sparkles className="w-4 h-4 text-violet-600" />;
      default: return <MessageSquare className="w-4 h-4 text-indigo-600" />;
    }
  };

  const getNodeBg = (type: string) => {
    switch (type) {
      case 'image': return 'bg-pink-100 text-pink-700';
      case 'name': return 'bg-blue-100 text-blue-700';
      case 'phone': return 'bg-teal-100 text-teal-700';
      case 'email': return 'bg-amber-100 text-amber-700';
      case 'singleChoice': return 'bg-purple-100 text-purple-700';
      case 'multipleChoice': return 'bg-emerald-100 text-emerald-700';
      case 'aiResponse': return 'bg-violet-100 text-violet-700';
      default: return 'bg-indigo-100 text-indigo-700';
    }
  };

  const isInputNode = (type: string) => {
    return ['name', 'phone', 'email', 'singleChoice', 'multipleChoice', 'textQuestion'].includes(type);
  };

  const getAppBaseUrl = () => {
    if (typeof window === 'undefined') return 'https://akanksha-1007.github.io/mintage-bot';
    const origin = window.location.origin;
    const baseUrl = import.meta.env.BASE_URL || '/';
    const cleanBase = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
    return origin + cleanBase;
  };
  const activeOrigin = getAppBaseUrl();
  
  const embedScriptCode = `<script src="${activeOrigin}/widget.js" data-bot-id="${botId || 'demo_bot_id'}" async></script>`;
  const embedIframeCode = `<iframe src="${activeOrigin}/widget/${botId || 'demo_bot_id'}" width="380" height="600" style="border:none; border-radius:16px; box-shadow:0 10px 30px rgba(0,0,0,0.15);"></iframe>`;

  return (
    <div className="h-full flex flex-col bg-gray-50/50 font-sans select-none">
      {/* Top Header matching exact screenshot */}
      <header className="bg-white border-b border-gray-200 px-6 py-3 flex flex-wrap justify-between items-center gap-4 shadow-2xs z-20">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <span>Edit Your Chat Flow -</span>
            <input 
              type="text" 
              value={botName}
              onChange={(e) => setBotName(e.target.value)}
              className="font-bold text-indigo-600 bg-indigo-50/50 hover:bg-indigo-50 border border-indigo-200/60 focus:border-indigo-500 rounded-lg px-2.5 py-1 text-xl focus:outline-none focus:ring-2 focus:ring-indigo-200 transition-all w-64"
              placeholder="Get More Leads..."
            />
          </h1>
        </div>

        <div className="flex items-center gap-2.5">
          {/* Visualise Flow Button */}
          <button
            onClick={onToggleMode}
            className="flex items-center gap-2 px-3.5 py-2 text-xs font-semibold bg-white text-indigo-600 border border-indigo-200 hover:bg-indigo-50 rounded-lg transition-all shadow-2xs"
            title="Switch to 2D Node Canvas Builder"
          >
            <Layers className="w-4 h-4 text-indigo-600" />
            <span>Visualise Flow</span>
          </button>

          {/* Import Template Button */}
          <button
            onClick={() => setShowTemplateModal(true)}
            className="flex items-center gap-2 px-3.5 py-2 text-xs font-semibold bg-white text-gray-700 border border-gray-200 hover:bg-gray-50 rounded-lg transition-all shadow-2xs"
          >
            <Wand2 className="w-4 h-4 text-purple-500" />
            <span>Import template</span>
          </button>

          {/* Test Chat Button */}
          <button
            onClick={startTestChat}
            className="flex items-center gap-2 px-3.5 py-2 text-xs font-semibold bg-white text-blue-600 border border-blue-200 hover:bg-blue-50 rounded-lg transition-all shadow-2xs"
          >
            <Eye className="w-4 h-4 text-blue-600" />
            <span>Test</span>
          </button>

          {/* Install Widget Button */}
          <button
            onClick={() => setShowInstallModal(true)}
            className="flex items-center gap-2 px-4 py-2 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-all shadow-sm shadow-blue-200"
          >
            <Code className="w-4 h-4" />
            <span>Install</span>
          </button>

          {/* Connect Sheet Button */}
          <button
            onClick={() => setShowSheetsModal(true)}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg transition-all border ${
              botSpreadsheetId 
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100' 
                : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
            }`}
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
            <span>{botSpreadsheetId ? 'Sheet Linked' : 'Sheet'}</span>
          </button>

          {/* Save / Publish */}
          <button
            onClick={onSave}
            disabled={isSaving}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 text-white text-xs font-bold rounded-lg hover:bg-emerald-700 transition-all shadow-sm disabled:opacity-50"
          >
            <Save className="w-3.5 h-3.5" />
            <span>{isSaving ? 'Saving...' : 'Save'}</span>
          </button>
        </div>
      </header>

      {/* 3 Column Main Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* ================= COLUMN 1: Add Chat Component ================= */}
        <div className="w-72 bg-white border-r border-gray-200 flex flex-col shrink-0 overflow-y-auto">
          {/* Header Bar */}
          <div className="bg-gray-100/80 px-4 py-3 border-b border-gray-200 text-center">
            <h2 className="text-xs font-bold text-gray-700 uppercase tracking-wide">Add Chat Component</h2>
          </div>

          <div className="p-3 space-y-3">
            {/* Category: Frequently Used */}
            <div className="border border-gray-200 rounded-xl overflow-hidden bg-white shadow-2xs">
              <button
                onClick={() => toggleCategory('frequentlyUsed')}
                className="w-full px-3.5 py-2.5 bg-gray-50/80 hover:bg-gray-100 flex justify-between items-center text-xs font-bold text-gray-800 transition-colors"
              >
                <span>Frequently used</span>
                <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${expandedCategories.frequentlyUsed ? '' : '-rotate-90'}`} />
              </button>

              {expandedCategories.frequentlyUsed && (
                <div className="p-2 space-y-1.5 bg-white">
                  <button
                    onClick={() => addComponentNode('message')}
                    className="w-full flex items-center gap-3 px-3 py-2 text-xs font-semibold text-gray-700 bg-gray-50/50 hover:bg-indigo-50/60 hover:text-indigo-700 rounded-lg border border-gray-100 hover:border-indigo-200 transition-all text-left group"
                  >
                    <span className="p-1.5 rounded-md bg-amber-100 text-amber-600 group-hover:scale-110 transition-transform">🚀</span>
                    <span className="font-bold">Message</span>
                  </button>

                  <button
                    onClick={() => addComponentNode('name')}
                    className="w-full flex items-center gap-3 px-3 py-2 text-xs font-semibold text-gray-700 bg-gray-50/50 hover:bg-indigo-50/60 hover:text-indigo-700 rounded-lg border border-gray-100 hover:border-indigo-200 transition-all text-left group"
                  >
                    <span className="p-1 rounded-md bg-blue-100 text-blue-600 group-hover:scale-110 transition-transform"><User className="w-4 h-4" /></span>
                    <span className="font-bold">Name</span>
                  </button>

                  <button
                    onClick={() => addComponentNode('phone')}
                    className="w-full flex items-center gap-3 px-3 py-2 text-xs font-semibold text-gray-700 bg-gray-50/50 hover:bg-indigo-50/60 hover:text-indigo-700 rounded-lg border border-gray-100 hover:border-indigo-200 transition-all text-left group"
                  >
                    <span className="p-1 rounded-md bg-teal-100 text-teal-600 group-hover:scale-110 transition-transform"><Phone className="w-4 h-4" /></span>
                    <span className="font-bold">Phone Number</span>
                  </button>

                  <button
                    onClick={() => addComponentNode('email')}
                    className="w-full flex items-center gap-3 px-3 py-2 text-xs font-semibold text-gray-700 bg-gray-50/50 hover:bg-indigo-50/60 hover:text-indigo-700 rounded-lg border border-gray-100 hover:border-indigo-200 transition-all text-left group"
                  >
                    <span className="p-1 rounded-md bg-amber-100 text-amber-600 group-hover:scale-110 transition-transform"><Mail className="w-4 h-4" /></span>
                    <span className="font-bold">Email</span>
                  </button>

                  <button
                    onClick={() => addComponentNode('singleChoice')}
                    className="w-full flex items-center gap-3 px-3 py-2 text-xs font-semibold text-gray-700 bg-gray-50/50 hover:bg-indigo-50/60 hover:text-indigo-700 rounded-lg border border-gray-100 hover:border-indigo-200 transition-all text-left group"
                  >
                    <span className="p-1.5 rounded-md bg-purple-100 text-purple-600 group-hover:scale-110 transition-transform">👆</span>
                    <span className="font-bold">Single Choice</span>
                  </button>

                  <button
                    onClick={() => addComponentNode('multipleChoice')}
                    className="w-full flex items-center gap-3 px-3 py-2 text-xs font-semibold text-gray-700 bg-gray-50/50 hover:bg-indigo-50/60 hover:text-indigo-700 rounded-lg border border-gray-100 hover:border-indigo-200 transition-all text-left group"
                  >
                    <span className="p-1.5 rounded-md bg-emerald-100 text-emerald-600 group-hover:scale-110 transition-transform">📊</span>
                    <span className="font-bold">Multiple Choice</span>
                  </button>

                  <button
                    onClick={() => addComponentNode('textQuestion')}
                    className="w-full flex items-center gap-3 px-3 py-2 text-xs font-semibold text-gray-700 bg-gray-50/50 hover:bg-indigo-50/60 hover:text-indigo-700 rounded-lg border border-gray-100 hover:border-indigo-200 transition-all text-left group"
                  >
                    <span className="p-1.5 rounded-md bg-cyan-100 text-cyan-600 group-hover:scale-110 transition-transform">❓</span>
                    <span className="font-bold">Text Question</span>
                  </button>

                  <button
                    onClick={() => addComponentNode('aiResponse')}
                    className="w-full flex items-center gap-3 px-3 py-2 text-xs font-semibold text-gray-700 bg-gray-50/50 hover:bg-indigo-50/60 hover:text-indigo-700 rounded-lg border border-gray-100 hover:border-indigo-200 transition-all text-left group"
                  >
                    <span className="p-1 rounded-md bg-violet-100 text-violet-600 group-hover:scale-110 transition-transform"><Sparkles className="w-4 h-4" /></span>
                    <span className="font-bold">AI Responses</span>
                  </button>
                </div>
              )}
            </div>

            {/* Category: Request Information */}
            <div className="border border-gray-200 rounded-xl overflow-hidden bg-white shadow-2xs">
              <button
                onClick={() => toggleCategory('requestInfo')}
                className="w-full px-3.5 py-2.5 bg-gray-50/80 hover:bg-gray-100 flex justify-between items-center text-xs font-bold text-gray-800 transition-colors"
              >
                <span>Request Information</span>
                <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${expandedCategories.requestInfo ? '' : '-rotate-90'}`} />
              </button>
              {expandedCategories.requestInfo && (
                <div className="p-2 space-y-1.5 bg-white">
                  <button onClick={() => addComponentNode('name')} className="w-full text-left px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-indigo-50 rounded-lg">Name Input</button>
                  <button onClick={() => addComponentNode('phone')} className="w-full text-left px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-indigo-50 rounded-lg">Phone Input</button>
                  <button onClick={() => addComponentNode('email')} className="w-full text-left px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-indigo-50 rounded-lg">Email Input</button>
                </div>
              )}
            </div>

            {/* Category: Send Information */}
            <div className="border border-gray-200 rounded-xl overflow-hidden bg-white shadow-2xs">
              <button
                onClick={() => toggleCategory('sendInfo')}
                className="w-full px-3.5 py-2.5 bg-gray-50/80 hover:bg-gray-100 flex justify-between items-center text-xs font-bold text-gray-800 transition-colors"
              >
                <span>Send Information</span>
                <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${expandedCategories.sendInfo ? '' : '-rotate-90'}`} />
              </button>
              {expandedCategories.sendInfo && (
                <div className="p-2 space-y-1.5 bg-white">
                  <button onClick={() => addComponentNode('message')} className="w-full text-left px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-indigo-50 rounded-lg">Bot Message</button>
                  <button onClick={() => addComponentNode('image')} className="w-full text-left px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-indigo-50 rounded-lg">Image / GIF</button>
                </div>
              )}
            </div>

            {/* Category: Decide and Act */}
            <div className="border border-gray-200 rounded-xl overflow-hidden bg-white shadow-2xs">
              <button
                onClick={() => toggleCategory('decideAct')}
                className="w-full px-3.5 py-2.5 bg-gray-50/80 hover:bg-gray-100 flex justify-between items-center text-xs font-bold text-gray-800 transition-colors"
              >
                <span>Decide and Act</span>
                <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${expandedCategories.decideAct ? '' : '-rotate-90'}`} />
              </button>
              {expandedCategories.decideAct && (
                <div className="p-2 space-y-1.5 bg-white">
                  <button onClick={() => addComponentNode('singleChoice')} className="w-full text-left px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-indigo-50 rounded-lg">Branch by Choice</button>
                  <button onClick={() => addComponentNode('aiResponse')} className="w-full text-left px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-indigo-50 rounded-lg">AI Smart Answer</button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ================= COLUMN 2: Create/Reorder Chat Flow ================= */}
        <div className="flex-1 flex flex-col bg-[#f8fafc] bg-[radial-gradient(#cbd5e1_1px,transparent_1px)] [background-size:16px_16px] overflow-y-auto">
          {/* Header Bar */}
          <div className="bg-gray-100/80 px-4 py-3 border-b border-gray-200 text-center sticky top-0 z-10 backdrop-blur-xs">
            <h2 className="text-xs font-bold text-gray-700 uppercase tracking-wide">Create/Reorder Chat Flow</h2>
          </div>

          <div className="p-8 max-w-2xl mx-auto w-full space-y-6">
            {safeNodes.length === 0 ? (
              <div className="text-center py-16 bg-white/80 rounded-2xl border-2 border-dashed border-gray-300 p-8">
                <MessageSquare className="w-12 h-12 text-indigo-400 mx-auto mb-3 animate-bounce" />
                <h3 className="text-sm font-bold text-gray-800">Your Chat Flow is Empty</h3>
                <p className="text-xs text-gray-500 mt-1 mb-4">Click components on the left sidebar to add bot messages and questions.</p>
                <button
                  onClick={() => addComponentNode('message')}
                  className="px-4 py-2 bg-indigo-600 text-white font-bold text-xs rounded-xl hover:bg-indigo-700 transition-all shadow-md"
                >
                  + Add First Welcome Message
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
                    className={`group relative flex items-start gap-3 transition-all cursor-pointer ${
                      isSelected ? 'scale-[1.01]' : 'opacity-90 hover:opacity-100'
                    }`}
                  >
                    {/* Left Icon Avatar */}
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 shadow-sm mt-1 ${getNodeBg(node.type)}`}>
                      {getNodeIcon(node.type)}
                    </div>

                    {/* Chat Bubble Card */}
                    <div className={`flex-1 rounded-2xl p-4 transition-all shadow-xs border ${
                      node.type === 'message' 
                        ? 'bg-purple-50/60 border-purple-100 text-purple-950' 
                        : 'bg-white border-gray-200/80 text-gray-900'
                    } ${
                      isSelected ? 'ring-2 ring-indigo-500 border-indigo-500 shadow-md' : 'hover:border-indigo-300'
                    }`}>
                      {/* Image preview if exists */}
                      {imageUrl && (
                        <div className="mb-3 rounded-xl overflow-hidden max-h-48 bg-gray-100">
                          <img src={imageUrl} alt="Bot attachment" className="w-full h-full object-cover" />
                        </div>
                      )}

                      {/* Text label */}
                      <p className="text-sm font-medium whitespace-pre-wrap leading-relaxed">
                        {nodeLabel}
                      </p>

                      {/* Choice options preview if single/multiple choice */}
                      {choices && choices.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {choices.map((choice, idx) => {
                            const targetId = (node.data?.optionRoutes as Record<string, string>)?.[choice];
                            const targetIndex = targetId ? safeNodes.findIndex(n => n.id === targetId) : -1;
                            const targetNode = targetIndex !== -1 ? safeNodes[targetIndex] : null;

                            return (
                              <span key={idx} className="px-3 py-1.5 bg-indigo-50 text-indigo-700 border border-indigo-200 text-xs font-bold rounded-lg flex items-center gap-1.5 shadow-2xs">
                                <span>{choice}</span>
                                {targetNode ? (
                                  <span className="text-[10px] bg-indigo-600 text-white px-1.5 py-0.5 rounded font-mono font-semibold">
                                    ➜ Step #{targetIndex + 1}: {((targetNode.data?.label as string) || targetNode.type).slice(0, 16)}
                                  </span>
                                ) : (
                                  <span className="text-[9px] text-gray-400 font-normal">➜ Next</span>
                                )}
                              </span>
                            );
                          })}
                        </div>
                      )}

                      {/* Next Step / Redirection Indicator Footer */}
                      <div className="mt-3 pt-2 border-t border-gray-100/80 flex items-center justify-between text-[11px]">
                        <span className="text-gray-400 font-semibold text-[10px]">Next Step:</span>
                        {node.data?.nextStepId === 'END' ? (
                          <span className="px-2 py-0.5 bg-red-50 text-red-600 border border-red-200 rounded-md font-bold text-[10px]">
                            🛑 End Chat Flow
                          </span>
                        ) : node.data?.nextStepId ? (() => {
                          const targetIdx = safeNodes.findIndex(n => n.id === node.data.nextStepId);
                          const targetNode = targetIdx !== -1 ? safeNodes[targetIdx] : null;
                          return targetNode ? (
                            <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-md font-bold text-[10px] flex items-center gap-1">
                              ➜ Step #{targetIdx + 1}: {((targetNode.data?.label as string) || targetNode.type).slice(0, 20)}
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-[10px]">➜ Next</span>
                          );
                        })() : index < safeNodes.length - 1 ? (
                          <span className="px-2 py-0.5 bg-gray-100 text-gray-500 rounded text-[10px] font-medium">
                            ➜ Step #{index + 2} (Default Next)
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-md font-bold text-[10px]">
                            🏁 End of Flow
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Blue User Reply Badge on the right */}
                    {showUserReplyTag && (
                      <div className="shrink-0 self-center">
                        <span className="px-3 py-1.5 bg-blue-600 text-white text-xs font-bold rounded-xl shadow-xs border border-blue-500">
                          User Reply
                        </span>
                      </div>
                    )}

                    {/* Action buttons (Move Up, Move Down, Delete) */}
                    <div className="absolute -top-3 right-2 hidden group-hover:flex items-center gap-1 bg-white border border-gray-200 rounded-lg p-1 shadow-md z-10">
                      <button
                        onClick={(e) => { e.stopPropagation(); moveNode(index, 'up'); }}
                        disabled={index === 0}
                        className="p-1 hover:bg-gray-100 text-gray-600 rounded disabled:opacity-30"
                        title="Move Up"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); moveNode(index, 'down'); }}
                        disabled={index === safeNodes.length - 1}
                        className="p-1 hover:bg-gray-100 text-gray-600 rounded disabled:opacity-30"
                        title="Move Down"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); deleteNode(node.id); }}
                        className="p-1 hover:bg-red-50 text-red-600 rounded"
                        title="Delete Step"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}

            {/* Bottom Add Component Quick Bar */}
            <div className="pt-4 text-center">
              <button
                onClick={() => addComponentNode('message')}
                className="px-5 py-2.5 bg-white hover:bg-indigo-50 border border-indigo-200 text-indigo-600 text-xs font-bold rounded-xl shadow-xs transition-all flex items-center gap-2 mx-auto"
              >
                <Plus className="w-4 h-4" />
                <span>Add Component to Flow</span>
              </button>
            </div>
          </div>
        </div>

        {/* ================= COLUMN 3: Customize Bot Messages ================= */}
        <div className="w-80 bg-white border-l border-gray-200 flex flex-col shrink-0 overflow-y-auto">
          {/* Header Bar */}
          <div className="bg-gray-100/80 px-4 py-3 border-b border-gray-200 text-center">
            <h2 className="text-xs font-bold text-gray-700 uppercase tracking-wide">Customize Bot Messages</h2>
          </div>

          {selectedNode ? (
            <div className="flex-1 flex flex-col p-4 space-y-4">
              {/* Customize / Advanced Sub-Tabs */}
              <div className="flex border-b border-gray-200">
                <button
                  onClick={() => setActiveRightTab('customize')}
                  className={`flex-1 py-2 text-xs font-bold transition-all border-b-2 ${
                    activeRightTab === 'customize'
                      ? 'border-indigo-600 text-indigo-600'
                      : 'border-transparent text-gray-500 hover:text-gray-800'
                  }`}
                >
                  Customize
                </button>
                <button
                  onClick={() => setActiveRightTab('advanced')}
                  className={`flex-1 py-2 text-xs font-bold transition-all border-b-2 ${
                    activeRightTab === 'advanced'
                      ? 'border-indigo-600 text-indigo-600'
                      : 'border-transparent text-gray-500 hover:text-gray-800'
                  }`}
                >
                  Advanced
                </button>
              </div>

              {activeRightTab === 'customize' ? (
                <div className="space-y-4">
                  {/* Message Input Box */}
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1.5">
                      Message
                    </label>
                    <textarea
                      rows={4}
                      value={(selectedNode.data?.label as string) || ''}
                      onChange={(e) => updateSelectedNodeData('label', e.target.value)}
                      className="w-full text-xs p-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-200 focus:border-indigo-500 font-sans leading-relaxed resize-none"
                      placeholder="Welcome! Thanks for showing interest! 🚀"
                    />
                  </div>

                  {/* GIF / Image Input */}
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1.5">
                      GIF or Image URL
                    </label>
                    <input
                      type="text"
                      value={(selectedNode.data?.imageUrl as string) || ''}
                      onChange={(e) => updateSelectedNodeData('imageUrl', e.target.value)}
                      className="w-full text-xs px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-200 focus:border-indigo-500"
                      placeholder="https://example.com/media.gif"
                    />
                  </div>

                  {/* Emoji Picker Grid matching exact screenshot */}
                  <div>
                    <label className="block text-xs font-bold text-gray-600 mb-2">
                      Click to insert Emoji
                    </label>
                    <div className="grid grid-cols-6 gap-1.5 p-2 bg-gray-50 rounded-2xl border border-gray-200 max-h-48 overflow-y-auto">
                      {EMOJI_PALETTE.map((emoji, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => appendEmoji(emoji)}
                          className="w-8 h-8 flex items-center justify-center text-lg hover:bg-white rounded-lg transition-all hover:scale-125 hover:shadow-2xs"
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Next Step Configuration for ALL Components */}
                  <div className="pt-3 border-t border-gray-200 space-y-1.5">
                    <label className="block text-xs font-bold text-indigo-700 flex items-center justify-between">
                      <span>Next Step (Redirection)</span>
                      <span className="text-[9px] bg-indigo-50 px-2 py-0.5 rounded text-indigo-700 font-bold border border-indigo-100">Step Flow</span>
                    </label>
                    <p className="text-[10px] text-gray-500">
                      Select which step follows this component when user responds.
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
                            style: { stroke: '#6366f1', strokeWidth: 2 }
                          });
                        }
                        setEdges(updatedEdges);
                      }}
                      className="w-full bg-white border border-gray-300 rounded-xl px-3 py-2 text-xs font-semibold text-gray-800 focus:ring-2 focus:ring-indigo-200 focus:border-indigo-500 shadow-2xs"
                    >
                      <option value="">Default Next Step (Sequential)</option>
                      <option value="END">🛑 End Chat Flow Here</option>
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
                    <div className="pt-2 border-t border-gray-200">
                      <label className="block text-xs font-bold text-gray-700 mb-1">
                        Options & Step Redirection
                      </label>
                      <p className="text-[10px] text-gray-500 mb-3">Choose which step each option redirects the user to.</p>
                      
                      <div className="space-y-3">
                        {((selectedNode.data?.choices as string[]) || []).map((choice, idx) => {
                          const currentRoute = (selectedNode.data?.optionRoutes as Record<string, string>)?.[choice] || '';

                          return (
                            <div key={idx} className="p-2.5 bg-gray-50 rounded-xl border border-gray-200 space-y-2 shadow-2xs">
                              <div className="flex gap-2 items-center">
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
                                  className="flex-1 text-xs px-2.5 py-1.5 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-200 focus:border-indigo-500 font-semibold text-gray-800"
                                  placeholder="Option choice text"
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
                                  className="text-gray-400 hover:text-red-500 p-1.5 rounded-lg hover:bg-red-50 transition-colors"
                                  title="Remove choice option"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>

                              <div className="flex items-center gap-2 pt-1 border-t border-gray-200/60">
                                <span className="text-[11px] text-indigo-700 font-bold shrink-0">➜ Go to:</span>
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
                                  className="flex-1 bg-white border border-gray-300 rounded-lg px-2 py-1 text-xs text-gray-800 font-medium focus:ring-2 focus:ring-indigo-200"
                                >
                                  <option value="">Default Next Step</option>
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
                          className="text-xs font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1.5 mt-2 bg-indigo-50/60 hover:bg-indigo-100/60 px-3 py-2 rounded-xl transition-colors border border-indigo-100"
                        >
                          <Plus className="w-3.5 h-3.5" /> Add Choice
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                /* Advanced Tab */
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">
                      Lead Key Variable Name
                    </label>
                    <input
                      type="text"
                      value={(selectedNode.data?.key as string) || ''}
                      onChange={(e) => updateSelectedNodeData('key', e.target.value)}
                      className="w-full text-xs px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-200 focus:border-indigo-500 font-mono"
                      placeholder="full_name, phone, email"
                    />
                    <p className="text-[10px] text-gray-500 mt-1">This key is used to record lead answers into your database and Google Sheets.</p>
                  </div>

                  <div className="pt-4 border-t border-gray-200">
                    <button
                      onClick={() => deleteNode(selectedNode.id)}
                      className="w-full py-2 bg-red-50 hover:bg-red-100 text-red-600 font-bold text-xs rounded-xl border border-red-200 transition-colors flex items-center justify-center gap-2"
                    >
                      <Trash2 className="w-4 h-4" /> Delete Component
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="p-8 text-center text-xs text-gray-400">
              Select a component step from the center flow to customize text and emojis.
            </div>
          )}
        </div>
      </div>

      {/* ================= MODAL: Test Chat Flow ================= */}
      {showTestModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full h-[600px] flex flex-col shadow-2xl overflow-hidden border border-gray-100">
            {/* Header */}
            <div className="bg-indigo-600 p-4 text-white flex justify-between items-center">
              <div className="flex items-center gap-2">
                <Bot className="w-5 h-5 text-indigo-200" />
                <div>
                  <h3 className="text-sm font-bold">{botName}</h3>
                  <p className="text-[10px] text-indigo-200">Live Simulator Test</p>
                </div>
              </div>
              <button onClick={() => setShowTestModal(false)} className="text-white/80 hover:text-white p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Chat Body */}
            <div className="flex-1 p-4 bg-slate-50 overflow-y-auto space-y-3">
              {testMessages.map((msg, i) => (
                <div key={i} className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}>
                  {msg.image && (
                    <img src={msg.image} alt="bot media" className="w-48 h-32 object-cover rounded-xl mb-1 border border-gray-200" />
                  )}
                  <div className={`p-3 max-w-[80%] text-xs font-medium rounded-2xl whitespace-pre-wrap ${
                    msg.sender === 'user'
                      ? 'bg-indigo-600 text-white rounded-br-none shadow-xs'
                      : 'bg-white text-gray-900 border border-gray-200 rounded-bl-none shadow-xs'
                  }`}>
                    {msg.text}
                  </div>

                  {msg.options && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {msg.options.map((opt, oIdx) => (
                        <button
                          key={oIdx}
                          onClick={() => handleTestUserReply(opt)}
                          className="px-3 py-1 bg-white hover:bg-indigo-50 border border-indigo-200 text-indigo-700 text-xs font-bold rounded-lg shadow-2xs"
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Input Bar */}
            <div className="p-3 bg-white border-t border-gray-200 flex gap-2">
              <input
                type="text"
                value={testUserInput}
                onChange={(e) => setTestUserInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleTestUserReply()}
                placeholder="Type a message..."
                className="flex-1 text-xs px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-200 focus:border-indigo-500"
              />
              <button
                onClick={() => handleTestUserReply()}
                className="p-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL: Install Embed Widget ================= */}
      {showInstallModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-gray-100">
            <div className="flex justify-between items-start mb-4">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl">
                  <Code className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900">Install Chatbot Widget</h3>
                  <p className="text-xs text-gray-500">Paste this code snippet before the &lt;/body&gt; tag on your website.</p>
                </div>
              </div>
              <button onClick={() => setShowInstallModal(false)} className="text-gray-400 hover:text-gray-600 p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 mb-5">
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1.5">
                  Option 1: One-Line JS Script (Floating Chat Bubble)
                </label>
                <div className="bg-gray-900 text-gray-100 p-3.5 rounded-2xl font-mono text-xs overflow-x-auto relative group">
                  <pre className="whitespace-pre-wrap leading-relaxed">{embedScriptCode}</pre>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(embedScriptCode);
                      setCopiedCode(true);
                      setTimeout(() => setCopiedCode(false), 2000);
                    }}
                    className="absolute top-2 right-2 px-2.5 py-1 bg-indigo-600 text-white font-bold text-[10px] rounded-lg opacity-90 hover:opacity-100 transition-all flex items-center gap-1 shadow"
                  >
                    {copiedCode ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedCode ? 'Copied' : 'Copy Script'}</span>
                  </button>
                </div>
                <p className="text-[10px] text-gray-500 mt-1">Works on any HTML, WordPress, Webflow, Shopify, or React site.</p>
              </div>

              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1.5">
                  Option 2: Inline iFrame Embed
                </label>
                <div className="bg-gray-900 text-gray-100 p-3.5 rounded-2xl font-mono text-xs overflow-x-auto relative group">
                  <pre className="whitespace-pre-wrap leading-relaxed">{embedIframeCode}</pre>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(embedIframeCode);
                      setCopiedCode(true);
                      setTimeout(() => setCopiedCode(false), 2000);
                    }}
                    className="absolute top-2 right-2 px-2.5 py-1 bg-indigo-600 text-white font-bold text-[10px] rounded-lg opacity-90 hover:opacity-100 transition-all flex items-center gap-1 shadow"
                  >
                    {copiedCode ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedCode ? 'Copied' : 'Copy iFrame'}</span>
                  </button>
                </div>
                <p className="text-[10px] text-gray-500 mt-1">Best for embedding directly inside a page layout or container.</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL: Import Template ================= */}
      {showTemplateModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-gray-100">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="text-lg font-bold text-gray-900">Import Preset Template</h3>
                <p className="text-xs text-gray-500">Choose a pre-built chat sequence to jumpstart your flow.</p>
              </div>
              <button onClick={() => setShowTemplateModal(false)} className="text-gray-400 hover:text-gray-600 p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 mb-4">
              <button
                onClick={() => loadPresetTemplate('lead')}
                className="w-full p-4 bg-gray-50 hover:bg-indigo-50 hover:border-indigo-200 border border-gray-200 rounded-2xl text-left transition-all"
              >
                <div className="font-bold text-sm text-gray-900">🚀 Lead Generation Flow</div>
                <div className="text-xs text-gray-500 mt-1">Welcomes visitors, collects Name, Phone Number, and Email.</div>
              </button>

              <button
                onClick={() => loadPresetTemplate('booking')}
                className="w-full p-4 bg-gray-50 hover:bg-indigo-50 hover:border-indigo-200 border border-gray-200 rounded-2xl text-left transition-all"
              >
                <div className="font-bold text-sm text-gray-900">📅 Appointment Booking Flow</div>
                <div className="text-xs text-gray-500 mt-1">Asks for service choice, user name, and booking email.</div>
              </button>

              <button
                onClick={() => loadPresetTemplate('support')}
                className="w-full p-4 bg-gray-50 hover:bg-indigo-50 hover:border-indigo-200 border border-gray-200 rounded-2xl text-left transition-all"
              >
                <div className="font-bold text-sm text-gray-900">💬 Customer Support & FAQ</div>
                <div className="text-xs text-gray-500 mt-1">Collects detailed issue description and user contact.</div>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
