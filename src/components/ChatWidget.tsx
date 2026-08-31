import React, { useState, useEffect, useRef } from 'react';
import { db } from '../lib/firebase';
import { doc, getDoc, getDocs, collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { motion, AnimatePresence } from 'motion/react';
import { AlertCircle, Bot, ChevronRight, Loader2, Send } from 'lucide-react';
import { validateFieldValue } from '../lib/validation';

interface ChatWidgetProps {
  botId: string;
}

interface Message {
  id: string;
  text: string;
  sender: 'bot' | 'user';
  type?: string;
  choices?: string[];
  imageUrl?: string;
}

export default function ChatWidget({ botId }: ChatWidgetProps) {
  const [nodes, setNodes] = useState<any[]>([]);
  const [edges, setEdges] = useState<any[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [currentNodeId, setCurrentNodeId] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState('');
  const [inputError, setInputError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [leadData, setLeadData] = useState<Record<string, any>>({});
  const [dynamicFields, setDynamicFields] = useState<Array<{ fieldId: string; label: string; value: string }>>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [isTyping, setIsTyping] = useState(false);
  const [botTitle, setBotTitle] = useState('BotFlow Assistant');

  // Real-time Chatbot User Identification & Session Tracking
  const [chatUserId, setChatUserId] = useState<string>(() => {
    let stored = localStorage.getItem('mintage_chatbot_user_id');
    if (!stored) {
      stored = 'cb_user_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
      localStorage.setItem('mintage_chatbot_user_id', stored);
    }
    return stored;
  });
  const [conversationId, setConversationId] = useState<string | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  // Initialize or restore session with backend API
  useEffect(() => {
    const initSession = async () => {
      try {
        const res = await fetch('/api/chatbot/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: chatUserId,
            botId: botId || 'default_bot',
            source: window.location.href,
            consent: true
          })
        });
        if (res.ok) {
          const data = await res.json();
          if (data.success) {
            if (data.userId) {
              setChatUserId(data.userId);
              localStorage.setItem('mintage_chatbot_user_id', data.userId);
            }
            if (data.conversationId) {
              setConversationId(data.conversationId);
            }
          }
        }
      } catch (err) {
        console.warn('[SESSION_INIT_NOTICE]', err);
      }
    };

    initSession();
  }, [botId]);

  // Helper to persist every message & response through backend API to Firebase
  const trackMessageToBackend = async (
    sender: 'bot' | 'user' | 'system',
    text: string,
    messageType: string = 'text',
    profileUpdate?: { name?: string; email?: string; phone?: string }
  ) => {
    if (!chatUserId) return;
    try {
      let activeConvId = conversationId;
      if (!activeConvId) {
        const sessRes = await fetch('/api/chatbot/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: chatUserId, botId: botId || 'default_bot', source: window.location.href })
        });
        if (sessRes.ok) {
          const sessData = await sessRes.json();
          if (sessData.conversationId) {
            activeConvId = sessData.conversationId;
            setConversationId(activeConvId);
          }
        }
      }

      if (!activeConvId) return;

      await fetch('/api/chatbot/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: chatUserId,
          conversationId: activeConvId,
          botId: botId || 'default_bot',
          sender,
          message: text,
          messageType,
          userProfileUpdate: profileUpdate
        })
      });
    } catch (err) {
      console.warn('[MESSAGE_TRACKING_NOTICE]', err);
    }
  };

  const safeNodes = Array.isArray(nodes) ? nodes : (nodes && typeof nodes === 'object' ? Object.values(nodes) : []);
  const safeEdges = Array.isArray(edges) ? edges : (edges && typeof edges === 'object' ? Object.values(edges) : []);

  const processBotStep = (node: any, allNodes: any[] = safeNodes, allEdges: any[] = safeEdges) => {
    const nodesList = Array.isArray(allNodes) && allNodes.length > 0 ? allNodes : safeNodes;
    const edgesList = Array.isArray(allEdges) && allEdges.length > 0 ? allEdges : safeEdges;

    setIsTyping(true);
    setTimeout(() => {
      setIsTyping(false);
      const newMessage: Message = {
        id: Date.now().toString() + '_' + Math.random().toString(36).substring(2, 6),
        text: node.data?.label || node.data?.text || '',
        sender: 'bot',
        type: node.type,
        choices: node.data?.choices,
        imageUrl: node.data?.imageUrl || node.data?.url,
      };
      setMessages(prev => [...prev, newMessage]);

      // Track bot response in Firebase / Backend
      if (newMessage.text) {
        trackMessageToBackend('bot', newMessage.text, node.type || 'text');
      }

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
          const defaultEdge = edgesList.find((e: any) => e.source === node.id && !e.sourceHandle);
          if (defaultEdge) {
            targetNodeId = defaultEdge.target;
          } else {
            const anyEdge = edgesList.find((e: any) => e.source === node.id);
            if (anyEdge) targetNodeId = anyEdge.target;
          }
        }

        if (!targetNodeId) {
          const currentIdx = nodesList.findIndex((n: any) => n.id === node.id);
          if (currentIdx !== -1 && currentIdx + 1 < nodesList.length) {
            targetNodeId = nodesList[currentIdx + 1].id;
          }
        }

        if (targetNodeId) {
          const nextNode = nodesList.find((n: any) => n.id === targetNodeId);
          if (nextNode) {
            setCurrentNodeId(nextNode.id);
            // Auto advance to next step with natural typing pause
            setTimeout(() => {
              processBotStep(nextNode, nodesList, edgesList);
            }, 800);
          }
        }
      }
    }, 600);
  };

  useEffect(() => {
    const loadBot = async () => {
      setIsLoading(true);
      setError(null);

      let botData: any = null;
      const cleanBotId = (botId || '').trim();
      const lowerBotId = cleanBotId.toLowerCase();

      // 1. Try loading from Firestore if botId is given and not SAVE_FIRST
      if (cleanBotId && cleanBotId !== 'SAVE_FIRST') {
        try {
          const botRef = doc(db, 'bot_configurations', cleanBotId);
          const botSnap = await getDoc(botRef).catch(() => null);
          if (botSnap && botSnap.exists()) {
            botData = botSnap.data();
          } else {
            // Match specifically by exact ID or exact client name in Firestore (NO cross-client matching)
            const allSnap = await getDocs(collection(db, 'bot_configurations')).catch(() => null);
            if (allSnap && !allSnap.empty) {
              const matchedDoc = allSnap.docs.find(d => {
                const data = d.data();
                const dId = (d.id || '').toLowerCase();
                const name = (data?.name || '').toLowerCase();
                if (dId === lowerBotId || data?.id === cleanBotId) return true;
                if (name === lowerBotId) return true;
                if (lowerBotId.includes('risinia') && name.includes('risinia') && !lowerBotId.includes('river')) return true;
                if (lowerBotId.includes('river') && name.includes('river') && !lowerBotId.includes('risinia')) return true;
                return false;
              });
              if (matchedDoc && matchedDoc.exists()) {
                botData = matchedDoc.data();
              }
            }
          }
        } catch (err) {
          console.warn('Firestore bot loading notice:', err);
        }
      }

      // 2. Try loading from Server API (/api/bots/:id)
      if (!botData && cleanBotId && cleanBotId !== 'SAVE_FIRST') {
        try {
          const res = await fetch(`/api/bots/${encodeURIComponent(cleanBotId)}`);
          const contentType = res.headers.get('content-type') || '';
          if (res.ok && contentType.includes('application/json')) {
            const apiRes = await res.json();
            if (apiRes.success && apiRes.bot) {
              botData = apiRes.bot;
            }
          }
        } catch (apiErr) {
          console.warn('Server API bot loading notice:', apiErr);
        }
      }

      // 3. Try loading from localStorage
      if (!botData && cleanBotId && cleanBotId !== 'SAVE_FIRST') {
        try {
          const localBotsRaw = localStorage.getItem('mintage_bots') || localStorage.getItem('botflow_local_bots');
          if (localBotsRaw) {
            const localBots = JSON.parse(localBotsRaw);
            const botsList = Array.isArray(localBots) ? localBots : Object.values(localBots);
            if (Array.isArray(botsList) && botsList.length > 0) {
              botData = botsList.find((b: any) => {
                const idMatch = (b.id || '').toLowerCase() === lowerBotId;
                const nameMatch = (b.name || '').toLowerCase() === lowerBotId;
                const risiniaMatch = lowerBotId.includes('risinia') && !lowerBotId.includes('river') && (b.name || '').toLowerCase().includes('risinia');
                const riverMatch = lowerBotId.includes('river') && !lowerBotId.includes('risinia') && (b.name || '').toLowerCase().includes('river');
                return idMatch || nameMatch || risiniaMatch || riverMatch;
              });
            }
          }
        } catch (lsErr) {
          console.warn('Local storage bot loading notice:', lsErr);
        }
      }

      // 4. Try loading static bots.json file
      if (!botData && cleanBotId && cleanBotId !== 'SAVE_FIRST') {
        const baseUrl = import.meta.env.BASE_URL || '/';
        const cleanBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
        const fetchTargets = [
          'bots.json',
          './bots.json',
          `${cleanBase}bots.json`,
          'https://akanksha-1007.github.io/mintage-bot/bots.json'
        ];

        for (const targetUrl of fetchTargets) {
          try {
            const res = await fetch(targetUrl);
            const contentType = res.headers.get('content-type') || '';
            if (res.ok && (contentType.includes('json') || contentType.includes('text/plain') || targetUrl.endsWith('.json'))) {
              const staticBots = await res.json();
              if (Array.isArray(staticBots) && staticBots.length > 0) {
                botData = staticBots.find((b: any) => {
                  const idMatch = (b.id || '').toLowerCase() === lowerBotId;
                  const nameMatch = (b.name || '').toLowerCase() === lowerBotId;
                  const risiniaMatch = lowerBotId.includes('risinia') && !lowerBotId.includes('river') && (b.name || '').toLowerCase().includes('risinia');
                  const riverMatch = lowerBotId.includes('river') && !lowerBotId.includes('risinia') && (b.name || '').toLowerCase().includes('river');
                  return idMatch || nameMatch || risiniaMatch || riverMatch;
                });
                if (botData) break;
              }
            }
          } catch (e) { }
        }
      }

      // 5. Fallback distinct default flow for requested client/bot ID if not found
      if (!botData) {
        const refUrl = (document.referrer || window.location.href || '').toLowerCase();
        const isRiver = lowerBotId.includes('river') || refUrl.includes('river') || refUrl.includes('riverscape');
        const isRisinia = lowerBotId.includes('risinia') || refUrl.includes('risinia');
        const clientName = isRiver
          ? 'River Scape Residences'
          : (isRisinia ? 'Risinia Builders' : 'BotFlow Assistant');

        botData = {
          id: cleanBotId || 'default_bot',
          name: clientName,
          nodes: [
            {
              id: 'node_welcome',
              type: 'message',
              data: {
                label: isRiver
                  ? '🌿 Welcome to River Scape Residences!\n\nExperience serene waterfront luxury homes with breathtaking views and modern lifestyle amenities.'
                  : (isRisinia
                    ? '👋 Welcome to Risinia Builders!\n\nDiscover thoughtfully designed 2 & 3 BHK Premium Apartments where luxury, comfort, and modern living come together.'
                    : '👋 Welcome! How can we assist you today?')
              },
              position: { x: 250, y: 120 }
            },
            {
              id: 'node_name',
              type: 'name',
              data: { label: 'To start, could you share your full name with us? ✨', key: 'full_name' },
              position: { x: 250, y: 240 }
            },
            {
              id: 'node_phone',
              type: 'phone',
              data: { label: 'Thanks! Could you also give us your phone number? 📞', key: 'phone_number' },
              position: { x: 250, y: 360 }
            },
            {
              id: 'node_email',
              type: 'email',
              data: { label: 'Perfect! Now please provide your email address so our team can reach out! ✉️', key: 'email_address' },
              position: { x: 250, y: 480 }
            }
          ],
          edges: [
            { id: 'e1', source: 'node_welcome', target: 'node_name' },
            { id: 'e2', source: 'node_name', target: 'node_phone' },
            { id: 'e3', source: 'node_phone', target: 'node_email' }
          ]
        };
      }

      if (!botData) {
        setError('No custom bot flow found. Please build and save your bot flow in the dashboard.');
        setIsLoading(false);
        return;
      }

      setBotTitle(botData.name || 'BotFlow Assistant');

      const nodesData = Array.isArray(botData.nodes)
        ? botData.nodes
        : botData.nodes && typeof botData.nodes === 'object'
          ? Object.values(botData.nodes)
          : [];

      const edgesData = Array.isArray(botData.edges)
        ? botData.edges
        : botData.edges && typeof botData.edges === 'object'
          ? Object.values(botData.edges)
          : [];

      if (nodesData.length === 0) {
        setError('This bot exists, but it has no configured flow.');
        setIsLoading(false);
        return;
      }

      setNodes(nodesData);
      setEdges(edgesData);
      setMessages([]);

      const startNode =
        nodesData.find((node: any) => node.type === 'input') ||
        nodesData[0];

      if (!startNode) {
        setError('This bot has no starting node.');
        setIsLoading(false);
        return;
      }

      // Skip empty Start/Input node if present
      if (startNode.type === 'input') {
        const firstEdge = edgesData.find(
          (edge: any) => edge.source === startNode.id
        );

        if (firstEdge) {
          const nextNode = nodesData.find(
            (node: any) => node.id === firstEdge.target
          );

          if (nextNode) {
            setCurrentNodeId(nextNode.id);
            processBotStep(nextNode, nodesData, edgesData);
            setIsLoading(false);
            return;
          }
        }
      }

      setCurrentNodeId(startNode.id);
      processBotStep(startNode, nodesData, edgesData);
      setIsLoading(false);
    };

    loadBot();
  }, [botId]);

  const handleUserInput = async (text: string) => {
    const cleanText = text.trim();
    if (!cleanText) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      text: cleanText,
      sender: 'user',
    };
    setMessages(prev => [...prev, userMsg]);
    setInputValue('');

    const currentNode = safeNodes.find((n: any) => n.id === currentNodeId);

    // Determine field label and key
    let fieldLabel = 'Field';
    let fieldKey = 'custom_field';
    let profileUpdate: { name?: string; email?: string; phone?: string } | undefined = undefined;

    if (currentNode) {
      if (currentNode.type === 'name') {
        fieldLabel = 'Name';
        fieldKey = 'name';
        profileUpdate = { name: cleanText };
      } else if (currentNode.type === 'email') {
        fieldLabel = 'Email';
        fieldKey = 'email';
        profileUpdate = { email: cleanText };
      } else if (currentNode.type === 'phone') {
        fieldLabel = 'Phone Number';
        fieldKey = 'phone';
        profileUpdate = { phone: cleanText };
      } else {
        fieldLabel = currentNode.data?.label || currentNode.data?.key || currentNode.data?.leadKey || 'Field';
        fieldKey = currentNode.data?.key || currentNode.data?.leadKey || currentNode.data?.label || ('field_' + Date.now());
      }

      // Enforce Chatbot Field Validation (Email must contain @, Phone must be 10 digits, Name must be >=3 letters)
      const validation = validateFieldValue(
        currentNode.type,
        fieldKey,
        fieldLabel,
        cleanText
      );

      if (!validation.isValid) {
        setInputError(validation.errorMsg || '⚠️ Invalid response.');
        trackMessageToBackend('user', cleanText, currentNode?.type || 'text', profileUpdate);
        setIsTyping(true);
        setTimeout(() => {
          setIsTyping(false);
          setMessages(prev => [...prev, {
            id: Date.now().toString() + '_val_err',
            text: validation.errorMsg || '⚠️ Please enter a valid response.',
            sender: 'bot'
          }]);
          if (validation.errorMsg) {
            trackMessageToBackend('bot', validation.errorMsg, 'validation_error');
          }
        }, 500);
        return;
      }
    }

    setInputError(null);

    // Track user message in Backend / Firebase
    trackMessageToBackend('user', cleanText, currentNode?.type || 'text', profileUpdate);

    const fieldId = currentNode?.id || ('node_' + Date.now());

    // Update dynamic fields array
    const updatedDynamicFields = [
      ...dynamicFields.filter(f => f.fieldId !== fieldId),
      { fieldId, label: fieldLabel, value: cleanText }
    ];
    setDynamicFields(updatedDynamicFields);

    // Update legacy leadData map for backwards compatibility
    const newLeadData = { ...leadData, [fieldKey]: cleanText };
    setLeadData(newLeadData);

    if (currentNode) {
      let targetNodeId: string | null = null;

      // 1. Check if choice matching or optionRoutes match (case-insensitive)
      if (currentNode.data?.optionRoutes) {
        const routes = currentNode.data.optionRoutes;
        const matchedRouteKey = Object.keys(routes).find(
          k => k.toLowerCase().trim() === cleanText.toLowerCase()
        );
        if (matchedRouteKey) {
          targetNodeId = routes[matchedRouteKey];
        }
      }

      // 2. Check if currentNode has an explicit nextStepId set
      if (!targetNodeId && currentNode.data?.nextStepId) {
        if (currentNode.data.nextStepId === 'END') {
          await saveLead(newLeadData, updatedDynamicFields);
          setIsTyping(true);
          setTimeout(() => {
            setIsTyping(false);
            setMessages(prev => [...prev, {
              id: Date.now().toString(),
              text: '🎉 Thank you! Your details have been submitted. Our team will contact you shortly.',
              sender: 'bot'
            }]);
          }, 600);
          return;
        }
        targetNodeId = currentNode.data.nextStepId;
      }

      // 3. Check if an edge explicitly matches this choice text
      if (!targetNodeId) {
        const choiceEdge = safeEdges.find((e: any) =>
          e.source === currentNodeId &&
          ((e.label && e.label.toLowerCase().trim() === cleanText.toLowerCase()) ||
            (e.sourceHandle && e.sourceHandle.toLowerCase().trim() === cleanText.toLowerCase()) ||
            (e.choice && e.choice.toLowerCase().trim() === cleanText.toLowerCase()))
        );
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
            await saveLead(newLeadData, updatedDynamicFields);
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

      // End of flow reached - save lead and send completion message
      await saveLead(newLeadData, updatedDynamicFields);
      setCurrentNodeId(null);
      setIsTyping(true);
      setTimeout(() => {
        setIsTyping(false);
        setMessages(prev => [...prev, {
          id: Date.now().toString(),
          text: '🎉 Thank you! Your details have been submitted. Our team will reach out to you shortly.',
          sender: 'bot'
        }]);
      }, 600);
    } else {
      // Flow ended previously, user is continuing chat
      await saveLead(newLeadData, updatedDynamicFields);
      setIsTyping(true);
      setTimeout(() => {
        setIsTyping(false);
        setMessages(prev => [...prev, {
          id: Date.now().toString(),
          text: `Thanks for your message! Our ${botTitle} team has received your note and will get back to you ASAP.`,
          sender: 'bot'
        }]);
      }, 600);
    }
  };

  const handleChoice = (choice: string) => {
    handleUserInput(choice);
  };

  const [isSubmitting, setIsSubmitting] = useState(false);
  // React state updates are asynchronous. A ref gives us an immediate guard so
  // rapid double-clicks or duplicate event handlers cannot fire /api/leads twice
  // from the same widget instance. The backend also has a persistent Firestore
  // idempotency lock for cross-instance protection.
  const leadSubmissionInFlightRef = useRef(false);

  const saveLead = async (data: any, fieldsList: Array<{ fieldId: string; label: string; value: string }> = dynamicFields) => {
    if (isSubmitting || leadSubmissionInFlightRef.current) {
      console.warn('[LEAD] duplicate submission blocked on client');
      return;
    }

    leadSubmissionInFlightRef.current = true;
    setIsSubmitting(true);

    const effectiveClientId = localStorage.getItem('mintage_effective_user_id') || localStorage.getItem('mintage_client_id') || undefined;
    const payload = {
      botId,
      clientId: effectiveClientId,
      userId: chatUserId,
      conversationId: conversationId,
      fields: fieldsList,
      sourceUrl: window.location.href,
      referrer: document.referrer || '',
      submittedAt: new Date().toISOString()
    };

    console.log('[LEAD] submitting', payload);

    const newLeadRecord = {
      id: 'lead_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
      botId,
      flowId: botId,
      fields: fieldsList,
      data,
      sourceUrl: window.location.href,
      submittedAt: new Date().toISOString(),
      googleSheetSyncStatus: 'synced'
    };

    try {
      const res = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const resData = await res.json();
      if (res.ok && resData.success) {
        console.log('[LEAD] submission success:', resData.leadId);
        newLeadRecord.id = resData.leadId || newLeadRecord.id;
      }
    } catch (error) {
      console.warn('[LEAD] submission network notice, using local persistence fallback:', error);
    }

    // Always persist to localStorage and dispatch custom event for real-time dashboard listeners
    try {
      const existingRaw = localStorage.getItem('mintage_leads');
      let existingLeads = [];
      if (existingRaw) existingLeads = JSON.parse(existingRaw);
      const updatedLeads = [newLeadRecord, ...existingLeads.filter((l: any) => l.id !== newLeadRecord.id)];
      localStorage.setItem('mintage_leads', JSON.stringify(updatedLeads));
      window.dispatchEvent(new CustomEvent('mintage_lead_captured', { detail: newLeadRecord }));
    } catch (e) {
      console.warn('Local storage lead save notice:', e);
    }

    setIsTyping(true);
    setTimeout(() => {
      setIsTyping(false);
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        text: '🎉 Thank you! Your details have been submitted successfully. Our team will contact you shortly.',
        sender: 'bot'
      }]);
    }, 600);

    // Reset submission state after the lead has been persisted.
    leadSubmissionInFlightRef.current = false;
    setIsSubmitting(false);
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
      <div className="chat-state">
        <Loader2 className="animate-spin" style={{ width: 22, height: 22, color: 'var(--text-tertiary)' }} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="chat-state">
        <span className="empty-icon"><Bot /></span>
        <div>
          <h3 className="text-[14px] font-semibold">Something's missing</h3>
          <p className="text-muted mt-1 max-w-[260px] text-[12.5px] leading-relaxed">{error}</p>
        </div>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="button-secondary"
        >
          Try again
        </button>
      </div>
    );
  }

  const currentNode = safeNodes.find((n: any) => n.id === currentNodeId);

  return (
    <div className="chat-widget">
      {/* Header */}
      <div className="chat-widget-header">
        <span className="icon-tile"><Bot /></span>
        <div className="min-w-0">
          <h3 className="truncate">{botTitle}</h3>
          <div className="chat-widget-status">
            <i />
            <span>Online</span>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="chat-log">
        <AnimatePresence initial={false}>
          {messages.map((msg) => (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.18, ease: [0.2, 0, 0.13, 1] }}
              className={`chat-row ${msg.sender === 'user' ? 'is-user' : 'is-bot'}`}
            >
              <div className="chat-bubble">
                {msg.imageUrl && (
                  <img src={msg.imageUrl} alt="" className="chat-bubble-media" />
                )}
                {msg.text && <p>{msg.text}</p>}

                {msg.choices && msg.sender === 'bot' && (
                  <div className="chat-choices">
                    {msg.choices.map((choice, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => handleChoice(choice)}
                        className="chat-choice"
                      >
                        <span>{choice}</span>
                        <ChevronRight />
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
              className="chat-row is-bot"
            >
              <div className="chat-typing" aria-label="Assistant is typing">
                <i /><i /><i />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <div ref={messagesEndRef} />
      </div>

      {/* Composer */}
      {!isTyping && (
        <div className="flex flex-col">
          {inputError && (
            <div className="px-3.5 py-1.5 bg-red-50 text-red-700 text-[12px] font-medium border-t border-b border-red-200/80 flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 flex-none" />
              <span>{inputError}</span>
            </div>
          )}
          <form
            onSubmit={(e) => { e.preventDefault(); if (inputValue.trim()) handleUserInput(inputValue); }}
            className="chat-composer"
          >
            <input
              type="text"
              value={inputValue}
              onChange={(e) => { setInputValue(e.target.value); if (inputError) setInputError(null); }}
              placeholder={
                currentNode?.type === 'name' ? 'Type your full name (alphabets only, min 3 letters)…' :
                  currentNode?.type === 'phone' ? 'Type your 10-digit phone number…' :
                    currentNode?.type === 'email' ? 'Type your email address (with @)…' :
                      'Type your response…'
              }
              className="input"
              aria-label="Your message"
            />
            <button
              type="submit"
              disabled={!inputValue.trim() || isSubmitting}
              className="chat-send"
              aria-label="Send message"
            >
              <Send />
            </button>
          </form>
        </div>
      )}

      {/* Footer */}
      <div className="chat-footer">
        Powered by <strong>Mintage</strong>
      </div>
    </div>
  );
}
