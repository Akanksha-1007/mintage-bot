import React, { useState, useEffect, useRef } from 'react';
import { db } from '../lib/firebase';
import { doc, getDoc, getDocs, collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { motion, AnimatePresence } from 'motion/react';
import { Send, User, Bot, Loader2, ChevronRight } from 'lucide-react';

interface ChatWidgetProps {
  botId: string;
}

interface Message {
  id: string;
  text: string;
  sender: 'bot' | 'user';
  type?: string;
  choices?: string[];
}

export default function ChatWidget({ botId }: ChatWidgetProps) {
  const [nodes, setNodes] = useState<any[]>([]);
  const [edges, setEdges] = useState<any[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [currentNodeId, setCurrentNodeId] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [leadData, setLeadData] = useState<Record<string, any>>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const loadBot = async () => {
      if (!botId || botId === 'SAVE_FIRST') {
        setError('Please save and publish your bot in the builder before previewing.');
        setIsLoading(false);
        return;
      }

      let nodesData: any[] = [];
      let edgesData: any[] = [];
      let found = false;

      // 1. Try Firestore
      try {
        const docRef = doc(db, 'bot_configurations', botId);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          const rawNodes = data.nodes;
          nodesData = Array.isArray(rawNodes) ? rawNodes : (rawNodes && typeof rawNodes === 'object' ? Object.values(rawNodes) : []);
          const rawEdges = data.edges;
          edgesData = Array.isArray(rawEdges) ? rawEdges : (rawEdges && typeof rawEdges === 'object' ? Object.values(rawEdges) : []);
          found = true;
        }
      } catch (err) {
        console.warn('Firestore fetch failed, trying server fallback:', err);
      }

      // 2. Try Server REST API Fallback
      if (!found) {
        try {
          const res = await fetch(`/api/bots/${encodeURIComponent(botId)}`);
          if (res.ok) {
            const data = await res.json();
            if (data.success && data.bot) {
              const rawNodes = data.bot.nodes;
              nodesData = Array.isArray(rawNodes) ? rawNodes : (rawNodes && typeof rawNodes === 'object' ? Object.values(rawNodes) : []);
              const rawEdges = data.bot.edges;
              edgesData = Array.isArray(rawEdges) ? rawEdges : (rawEdges && typeof rawEdges === 'object' ? Object.values(rawEdges) : []);
              found = true;
            }
          }
        } catch (serverErr) {
          console.warn('Server bot fetch error:', serverErr);
        }
      }

      // 3. Try Local Storage Fallback if not found in Firestore or Server
      if (!found) {
        try {
          const localBotsRaw = localStorage.getItem('mintage_bots') || localStorage.getItem('botflow_local_bots');
          if (localBotsRaw) {
            const parsed = JSON.parse(localBotsRaw);
            const match = Array.isArray(parsed) ? parsed.find((b: any) => b.id === botId) : (parsed[botId] || null);
            if (match && match.nodes) {
              const rawNodes = match.nodes;
              nodesData = Array.isArray(rawNodes) ? rawNodes : Object.values(rawNodes);
              const rawEdges = match.edges || [];
              edgesData = Array.isArray(rawEdges) ? rawEdges : Object.values(rawEdges);
              found = true;
            }
          }
        } catch (e) {
          console.warn('Local storage fallback error:', e);
        }
      }

      // 3.5 Try fetching ALL bots from Express server API
      if (!found) {
        try {
          const res = await fetch('/api/bots');
          if (res.ok) {
            const data = await res.json();
            if (data.success && Array.isArray(data.bots) && data.bots.length > 0) {
              const latestBot = data.bots[0];
              if (latestBot && latestBot.nodes && latestBot.nodes.length > 0) {
                const rawNodes = latestBot.nodes;
                nodesData = Array.isArray(rawNodes) ? rawNodes : Object.values(rawNodes);
                const rawEdges = latestBot.edges || [];
                edgesData = Array.isArray(rawEdges) ? rawEdges : Object.values(rawEdges);
                found = true;
              }
            }
          }
        } catch (e) {}
      }

      // 3.6 Try fallback to ANY saved bot in Local Storage
      if (!found) {
        try {
          const localBotsRaw = localStorage.getItem('mintage_bots') || localStorage.getItem('botflow_local_bots');
          if (localBotsRaw) {
            const parsed = JSON.parse(localBotsRaw);
            const firstBot = Array.isArray(parsed) && parsed.length > 0 ? parsed[0] : null;
            if (firstBot && firstBot.nodes) {
              const rawNodes = firstBot.nodes;
              nodesData = Array.isArray(rawNodes) ? rawNodes : Object.values(rawNodes);
              const rawEdges = firstBot.edges || [];
              edgesData = Array.isArray(rawEdges) ? rawEdges : Object.values(rawEdges);
              found = true;
            }
          }
        } catch (e) {}
      }

      // 3.7 Try fallback to ANY saved bot in Firestore collection
      if (!found) {
        try {
          const qSnap = await getDocs(collection(db, 'bot_configurations'));
          if (!qSnap.empty) {
            const firstDoc = qSnap.docs[0].data();
            if (firstDoc && firstDoc.nodes) {
              const rawNodes = firstDoc.nodes;
              nodesData = Array.isArray(rawNodes) ? rawNodes : Object.values(rawNodes);
              const rawEdges = firstDoc.edges || [];
              edgesData = Array.isArray(rawEdges) ? rawEdges : Object.values(rawEdges);
              found = true;
            }
          }
        } catch (e) {}
      }

      if (!found || nodesData.length === 0) {
        setError('No custom bot flow found. Please build and save your bot flow in the dashboard.');
        setIsLoading(false);
        return;
      }

      setNodes(nodesData);
      setEdges(edgesData);
      setMessages([]); // Clear messages

      // Find initial starting node
      const startNode = nodesData.find((n: any) => n.type === 'input') || nodesData[0];
      if (startNode) {
        const startLabel = (startNode.data?.label || startNode.data?.text || '').trim();
        // If the start node has no message text and is purely an anchor, skip to connected node
        if (startNode.type === 'input' && (!startLabel || startLabel.toLowerCase() === 'start')) {
          const firstEdge = edgesData.find((e: any) => e.source === startNode.id);
          if (firstEdge) {
            const nextNode = nodesData.find((n: any) => n.id === firstEdge.target);
            if (nextNode) {
              setCurrentNodeId(nextNode.id);
              processBotStep(nextNode);
              setIsLoading(false);
              return;
            }
          }
        }
        
        setCurrentNodeId(startNode.id);
        processBotStep(startNode);
      } else {
        setError('This bot has no messages configured yet.');
      }
      setIsLoading(false);
    };
    loadBot();
  }, [botId]);

  const [isTyping, setIsTyping] = useState(false);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  const safeNodes = Array.isArray(nodes) ? nodes : (nodes && typeof nodes === 'object' ? Object.values(nodes) : []);
  const safeEdges = Array.isArray(edges) ? edges : (edges && typeof edges === 'object' ? Object.values(edges) : []);

  const processBotStep = (node: any) => {
    setIsTyping(true);
    setTimeout(() => {
      setIsTyping(false);
      const newMessage: Message = {
        id: Date.now().toString() + '_' + Math.random().toString(36).substring(2, 6),
        text: node.data?.label || node.data?.text || '',
        sender: 'bot',
        type: node.type,
        choices: node.data?.choices,
      };
      setMessages(prev => [...prev, newMessage]);

      // Check if this node is non-interactive (does not require user input)
      const isInteractive = ['name', 'email', 'phone', 'textQuestion', 'singleChoice', 'multipleChoice'].includes(node.type);

      if (!isInteractive) {
        // Automatically find next node
        let targetNodeId: string | null = null;
        if (node.data?.nextStepId) {
          if (node.data.nextStepId !== 'END') {
            targetNodeId = node.data.nextStepId;
          } else {
            return; // Explicitly end flow
          }
        }

        if (!targetNodeId) {
          const defaultEdge = safeEdges.find((e: any) => e.source === node.id && !e.sourceHandle);
          if (defaultEdge) {
            targetNodeId = defaultEdge.target;
          } else {
            const anyEdge = safeEdges.find((e: any) => e.source === node.id);
            if (anyEdge) targetNodeId = anyEdge.target;
          }
        }

        if (!targetNodeId) {
          const currentIdx = safeNodes.findIndex((n: any) => n.id === node.id);
          if (currentIdx !== -1 && currentIdx + 1 < safeNodes.length) {
            targetNodeId = safeNodes[currentIdx + 1].id;
          }
        }

        if (targetNodeId) {
          const nextNode = safeNodes.find((n: any) => n.id === targetNodeId);
          if (nextNode) {
            setCurrentNodeId(nextNode.id);
            // Auto advance to next step with natural typing pause
            setTimeout(() => {
              processBotStep(nextNode);
            }, 800);
          }
        }
      }
    }, 600);
  };

  useEffect(() => {
    const loadBot = async () => {
      if (!botId) {
        setError('No Bot ID provided.');
        setIsLoading(false);
        return;
      }

      let nodesData: any[] = [];
      let edgesData: any[] = [];
      let found = false;

      // 1. Try Firestore
      try {
        const docRef = doc(db, 'bot_configurations', botId);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          const rawNodes = data.nodes;
          nodesData = Array.isArray(rawNodes) ? rawNodes : (rawNodes && typeof rawNodes === 'object' ? Object.values(rawNodes) : []);
          const rawEdges = data.edges;
          edgesData = Array.isArray(rawEdges) ? rawEdges : (rawEdges && typeof rawEdges === 'object' ? Object.values(rawEdges) : []);
          found = true;
        }
      } catch (err) {
        console.warn('Firestore fetch failed, trying local storage fallback:', err);
      }

      // 2. Try Local Storage Fallback if not found in Firestore
      if (!found) {
        try {
          const localBotsRaw = localStorage.getItem('mintage_bots') || localStorage.getItem('botflow_local_bots');
          if (localBotsRaw) {
            const parsed = JSON.parse(localBotsRaw);
            const match = Array.isArray(parsed) ? parsed.find((b: any) => b.id === botId) : (parsed[botId] || null);
            if (match && match.nodes) {
              const rawNodes = match.nodes;
              nodesData = Array.isArray(rawNodes) ? rawNodes : Object.values(rawNodes);
              const rawEdges = match.edges || [];
              edgesData = Array.isArray(rawEdges) ? rawEdges : Object.values(rawEdges);
              found = true;
            }
          }
        } catch (e) {
          console.warn('Local storage fallback error:', e);
        }
      }

      // 3. Fallback Default Starter Flow for demo or new widgets
      if (!found) {
        nodesData = [
          { id: 'node_1', type: 'message', data: { label: '👋 Hello! Welcome to BotFlow!' } },
          { id: 'node_1b', type: 'message', data: { label: 'We help businesses automate lead capture effortlessly.' } },
          { id: 'node_2', type: 'singleChoice', data: { label: 'What is your inquiry regarding?', choices: ['Sales & Pricing', 'Support & Help', 'Book a Demo'] } },
          { id: 'node_3', type: 'name', data: { label: 'May I know your full name?' } },
          { id: 'node_4', type: 'email', data: { label: 'And what is the best email address to reach you at?' } },
          { id: 'node_5', type: 'message', data: { label: 'Thank you! Our team will get back to you shortly. Have a great day! 🎉' } }
        ];
        edgesData = [
          { id: 'e1-1b', source: 'node_1', target: 'node_1b' },
          { id: 'e1b-2', source: 'node_1b', target: 'node_2' },
          { id: 'e2-3', source: 'node_2', target: 'node_3' },
          { id: 'e3-4', source: 'node_3', target: 'node_4' },
          { id: 'e4-5', source: 'node_4', target: 'node_5' }
        ];
      }

      setNodes(nodesData);
      setEdges(edgesData);
      setMessages([]); // Clear messages

      const startNode = nodesData.find((n: any) => n.type === 'input') || nodesData[0];
      if (startNode) {
        if (startNode.type === 'input') {
          const firstEdge = edgesData.find((e: any) => e.source === startNode.id);
          if (firstEdge) {
            const nextNode = nodesData.find((n: any) => n.id === firstEdge.target);
            if (nextNode) {
              setCurrentNodeId(nextNode.id);
              processBotStep(nextNode);
              setIsLoading(false);
              return;
            }
          }
        }
        setCurrentNodeId(startNode.id);
        processBotStep(startNode);
      } else {
        setError('This bot has no messages configured yet.');
      }
      setIsLoading(false);
    };
    loadBot();
  }, [botId]);

  const handleUserInput = async (text: string) => {
    const userMsg: Message = {
      id: Date.now().toString(),
      text,
      sender: 'user',
    };
    setMessages(prev => [...prev, userMsg]);
    setInputValue('');

      // Process lead data if current node is a question
      const currentNode = safeNodes.find((n: any) => n.id === currentNodeId);
      if (currentNode) {
        const newLeadData = { ...leadData };
        const key = currentNode.data.leadKey || currentNode.data.label;
        
        if (currentNode.type === 'name') newLeadData.name = text;
        else if (currentNode.type === 'email') newLeadData.email = text;
        else if (currentNode.type === 'phone') newLeadData.phone = text;
        else if (currentNode.type === 'textQuestion' || currentNode.type === 'singleChoice' || currentNode.type === 'multipleChoice') {
          newLeadData[key] = text;
        }
        
        setLeadData(newLeadData);

        // Determine target next node based on option routes, nextStepId, edges or sequence
        let targetNodeId: string | null = null;

        // 1. Check if currentNode has an option route for this choice text
        if (currentNode.data?.optionRoutes && currentNode.data.optionRoutes[text]) {
          targetNodeId = currentNode.data.optionRoutes[text];
        }

        // 2. Check if currentNode has an explicit nextStepId set
        if (!targetNodeId && currentNode.data?.nextStepId) {
          if (currentNode.data.nextStepId === 'END') {
            await saveLead(newLeadData);
            return;
          }
          targetNodeId = currentNode.data.nextStepId;
        }

        // 3. Check if an edge explicitly matches this choice text
        if (!targetNodeId) {
          const choiceEdge = safeEdges.find((e: any) => e.source === currentNodeId && (e.label === text || e.sourceHandle === text || e.choice === text));
          if (choiceEdge) {
            targetNodeId = choiceEdge.target;
          }
        }

        // 4. Fallback to default edge from currentNodeId
        if (!targetNodeId) {
          const defaultEdge = safeEdges.find((e: any) => e.source === currentNodeId && !e.sourceHandle);
          if (defaultEdge) {
            targetNodeId = defaultEdge.target;
          } else {
            const anyEdge = safeEdges.find((e: any) => e.source === currentNodeId);
            if (anyEdge) targetNodeId = anyEdge.target;
          }
        }

        // 5. Fallback to sequential next node in safeNodes
        if (!targetNodeId) {
          const currentIdx = safeNodes.findIndex((n: any) => n.id === currentNodeId);
          if (currentIdx !== -1 && currentIdx + 1 < safeNodes.length) {
            targetNodeId = safeNodes[currentIdx + 1].id;
          }
        }

        if (targetNodeId) {
          const nextNode = safeNodes.find((n: any) => n.id === targetNodeId);
          if (nextNode) {
            if (nextNode.type === 'saveLead') {
              await saveLead(newLeadData);
              // After saving, immediately look for the node AFTER the save node
              const nextEdge = safeEdges.find((e: any) => e.source === nextNode.id);
              if (nextEdge) {
                const finalNextNode = safeNodes.find((n: any) => n.id === nextEdge.target);
                if (finalNextNode) {
                  setCurrentNodeId(finalNextNode.id);
                  processBotStep(finalNextNode);
                  return;
                }
              }
            }
            
            setCurrentNodeId(nextNode.id);
            processBotStep(nextNode);
            return;
          }
        }

        // End of flow - save lead
        saveLead(newLeadData);
      }
  };

  const handleChoice = (choice: string) => {
    handleUserInput(choice);
  };

  const saveLead = async (data: any) => {
    try {
      // Fetch bot owner UID to store as ownerId on the lead
      const botRef = doc(db, 'bot_configurations', botId);
      const botSnap = await getDoc(botRef);
      let ownerId = null;
      let ownerData = null;
      let botSpreadsheetId = null;
      
      if (botSnap.exists()) {
        const botData = botSnap.data();
        ownerId = botData.createdBy;
        botSpreadsheetId = botData.spreadsheetId || null;
        
        if (ownerId) {
          const ownerRef = doc(db, 'users', ownerId);
          const ownerSnap = await getDoc(ownerRef);
          if (ownerSnap.exists()) {
            ownerData = ownerSnap.data();
          }
        }
      }

      await addDoc(collection(db, 'leads'), {
        flowId: botId,
        ownerId, // Link the lead to the bot owner for secure dashboard queries
        data,
        timestamp: serverTimestamp(),
        sourceUrl: window.location.href,
      });
      
      // Sync to Google Sheets if configured (prefers bot-specific sheet, falls back to owner default sheet)
      const targetSpreadsheetId = botSpreadsheetId || ownerData?.spreadsheetId;
      if (ownerData && ownerData.googleTokens && targetSpreadsheetId) {
        await syncToGoogleSheets(data, ownerData.googleTokens, targetSpreadsheetId);
      }
    } catch (error) {
      console.error('Error saving lead:', error);
    }
  };

  const syncToGoogleSheets = async (data: any, tokens: any, spreadsheetId: string) => {
    try {
      await fetch('/api/sync-lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tokens, spreadsheetId, leadData: data }),
      });
    } catch (error) {
      console.error('Error syncing to sheets:', error);
    }
  };

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center bg-white border border-gray-100 rounded-2xl">
        <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-gray-50 p-8 text-center border border-gray-100 rounded-2xl shadow-xl">
        <div className="bg-white p-4 rounded-full shadow-sm mb-4">
          <Bot className="w-10 h-10 text-indigo-300" />
        </div>
        <h3 className="text-gray-900 font-bold mb-2">Oops! Something's missing</h3>
        <p className="text-sm text-gray-500 leading-relaxed max-w-[240px]">
          {error}
        </p>
        <button 
          onClick={() => window.location.reload()}
          className="mt-6 px-4 py-2 bg-indigo-600 text-white text-xs font-bold rounded-lg hover:bg-indigo-700 transition-all"
        >
          Try Again
        </button>
      </div>
    );
  }

  const currentNode = safeNodes.find((n: any) => n.id === currentNodeId);
  const isQuestion = currentNode && ['name', 'email', 'phone', 'textQuestion', 'singleChoice', 'multipleChoice'].includes(currentNode.type);

  return (
    <div className="flex flex-col h-full bg-gray-50 font-sans overflow-hidden border border-gray-100 rounded-2xl shadow-2xl">
      {/* Header */}
      <div className="bg-indigo-600 p-4 flex items-center gap-3 shadow-md">
        <div className="bg-white/20 p-2 rounded-lg">
          <Bot className="w-5 h-5 text-white" />
        </div>
        <div>
          <h3 className="text-white font-bold text-sm">BotFlow Assistant</h3>
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse"></div>
            <span className="text-[10px] text-indigo-100 font-medium uppercase tracking-wider">Online</span>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 scroll-smooth">
        <AnimatePresence initial={false}>
          {messages.map((msg) => (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div className={`max-w-[80%] p-3 rounded-2xl text-sm shadow-sm ${
                msg.sender === 'user' 
                  ? 'bg-indigo-600 text-white rounded-tr-none' 
                  : 'bg-white text-gray-800 border border-gray-100 rounded-tl-none'
              }`}>
                {msg.text}
                
                {msg.choices && msg.sender === 'bot' && (
                  <div className="mt-3 space-y-2">
                    {msg.choices.map((choice, i) => (
                      <button
                        key={i}
                        onClick={() => handleChoice(choice)}
                        className="w-full text-left p-2.5 bg-gray-50 hover:bg-indigo-50 border border-gray-100 hover:border-indigo-200 rounded-xl text-xs font-bold text-indigo-600 transition-all flex items-center justify-between group"
                      >
                        {choice}
                        <ChevronRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          ))}
          {isTyping && (
            <motion.div
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex justify-start"
            >
              <div className="bg-white border border-gray-100 p-3 rounded-2xl rounded-tl-none text-gray-400 flex items-center gap-1.5 shadow-sm">
                <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce"></span>
                <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce [animation-delay:0.2s]"></span>
                <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce [animation-delay:0.4s]"></span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      {isQuestion && !currentNode.data.choices && (
        <form 
          onSubmit={(e) => { e.preventDefault(); if (inputValue.trim()) handleUserInput(inputValue); }}
          className="p-4 bg-white border-t border-gray-100 flex gap-2"
        >
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Type your answer..."
            className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
          />
          <button 
            type="submit"
            className="bg-indigo-600 text-white p-2.5 rounded-xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      )}

      {/* Footer Branding */}
      <div className="p-2.5 text-center bg-white border-t border-gray-50 flex items-center justify-center gap-1.5">
        <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">
          Powered by <span className="text-indigo-600 font-extrabold">Mintage Chatbot</span>
        </p>
      </div>
    </div>
  );
}
