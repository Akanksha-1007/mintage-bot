import React, { useState, useEffect, useRef } from 'react';
import { db, auth } from '../lib/firebase';
import { RecaptchaVerifier, signInWithPhoneNumber, ConfirmationResult } from 'firebase/auth';
import { doc, getDoc, getDocs, collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { motion, AnimatePresence } from 'motion/react';
import { Send, Bot, Loader2, ChevronRight } from 'lucide-react';

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

interface LeadRecord {
  id: string;
  botId: string;
  flowId: string;
  fields: Array<{ fieldId: string; label: string; value: string }>;
  data: any;
  sourceUrl: string;
  submittedAt: string;
  googleSheetSyncStatus: string;
  googleSheetSyncAction?: string | null;
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

  // Phone OTP verification state. Firebase handles the SMS/reCAPTCHA flow.
  const [otpStage, setOtpStage] = useState<'idle' | 'sending' | 'verify'>('idle');
  const [otpError, setOtpError] = useState<string | null>(null);
  const [otpPhone, setOtpPhone] = useState('');
  const confirmationResultRef = useRef<ConfirmationResult | null>(null);
  const recaptchaVerifierRef = useRef<RecaptchaVerifier | null>(null);
  const recaptchaContainerId = `mintage-recaptcha-${botId.replace(/[^a-zA-Z0-9_-]/g, '_')}`;

  // Prevent duplicate lead submissions and duplicate completion messages.
  const leadSubmitInFlightRef = useRef(false);
  const leadSubmittedRef = useRef(false);
  const thankYouShownRef = useRef(false);

  const showThankYouOnce = () => {
    // Display the completion message immediately. Backend / Google Sheets
    // delivery continues in the background and must never block the user.
    if (thankYouShownRef.current) return;

    const thankYouKey = `mintage_thankyou_${botId}_${conversationId || chatUserId}`;
    try {
      if (sessionStorage.getItem(thankYouKey) === '1') {
        thankYouShownRef.current = true;
        return;
      }
      sessionStorage.setItem(thankYouKey, '1');
    } catch {
      // In-memory guard below still prevents duplicates.
    }

    thankYouShownRef.current = true;
    setIsTyping(false);

    setMessages(prev => {
      if (prev.some(msg => msg.sender === 'bot' && msg.type === 'lead-complete')) {
        return prev;
      }
      return [...prev, {
        id: 'lead-complete-' + Date.now().toString(),
        text: '🎉 Thank you! Your details have been submitted successfully. Our team will contact you shortly.',
        sender: 'bot',
        type: 'lead-complete'
      }];
    });
  };

  useEffect(() => {
    return () => {
      try {
        recaptchaVerifierRef.current?.clear();
      } catch { }
      recaptchaVerifierRef.current = null;
    };
  }, [botId]);

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
      leadSubmitInFlightRef.current = false;
      leadSubmittedRef.current = false;
      thankYouShownRef.current = false;

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

  const normalizePhoneNumber = (value: string) => {
    const compact = value.trim().replace(/[\s()-]/g, '');
    if (/^\d{10}$/.test(compact)) return `+91${compact}`;
    if (/^\+\d{8,15}$/.test(compact)) return compact;
    return null;
  };

  const ensureRecaptcha = () => {
    if (recaptchaVerifierRef.current) return recaptchaVerifierRef.current;

    const verifier = new RecaptchaVerifier(auth, recaptchaContainerId, {
      size: 'invisible',
      'expired-callback': () => {
        setOtpError('Verification expired. Please try again.');
      },
    });

    recaptchaVerifierRef.current = verifier;
    return verifier;
  };

  const startPhoneOtp = async (phoneInput: string) => {
    const normalizedPhone = normalizePhoneNumber(phoneInput);
    if (!normalizedPhone) {
      setOtpError('Please enter a valid phone number. Example: 9876543210');
      setOtpStage('idle');
      return false;
    }

    setOtpError(null);
    setOtpStage('sending');
    setOtpPhone(normalizedPhone);

    try {
      const verifier = ensureRecaptcha();
      const confirmation = await signInWithPhoneNumber(auth, normalizedPhone, verifier);
      confirmationResultRef.current = confirmation;
      setOtpStage('verify');
      setMessages(prev => [...prev, {
        id: `otp-request-${Date.now()}`,
        text: `📱 We sent a 6-digit verification code to ${normalizedPhone}. Please enter the OTP to continue.`,
        sender: 'bot',
        type: 'phone-otp'
      }]);
      return true;
    } catch (error: any) {
      console.error('[PHONE_OTP_SEND_ERROR]', error);
      try {
        recaptchaVerifierRef.current?.clear();
      } catch { }
      recaptchaVerifierRef.current = null;
      setOtpStage('idle');
      setOtpError(
        error?.code === 'auth/too-many-requests'
          ? 'Too many OTP attempts. Please try again later.'
          : 'We could not send the OTP. Please check the number and try again.'
      );
      return false;
    }
  };

  const verifyPhoneOtp = async (codeInput: string, currentNode: any) => {
    const code = codeInput.trim().replace(/\D/g, '');
    if (!/^\d{6}$/.test(code)) {
      setOtpError('Please enter the 6-digit OTP.');
      return false;
    }

    if (!confirmationResultRef.current) {
      setOtpError('OTP session expired. Please request a new OTP.');
      setOtpStage('idle');
      return false;
    }

    try {
      setOtpError(null);
      setOtpStage('sending');
      await confirmationResultRef.current.confirm(code);
      confirmationResultRef.current = null;
      setOtpStage('idle');

      const fieldLabel = 'Phone Number';
      const fieldKey = currentNode?.data?.key || currentNode?.data?.leadKey || 'phone';
      const fieldId = currentNode?.id || ('node_' + Date.now());
      const updatedDynamicFields = [
        ...dynamicFields.filter(f => f.fieldId !== fieldId),
        { fieldId, label: fieldLabel, value: otpPhone }
      ];
      const newLeadData = { ...leadData, [fieldKey]: otpPhone, phone: otpPhone };

      setDynamicFields(updatedDynamicFields);
      setLeadData(newLeadData);
      trackMessageToBackend('user', otpPhone, 'phone', { phone: otpPhone });

      // Continue exactly as if the verified phone answer had just been entered.
      let targetNodeId: string | null = null;
      const cleanText = otpPhone.trim();
      if (currentNode?.data?.optionRoutes) {
        const routes = currentNode.data.optionRoutes;
        const matchedRouteKey = Object.keys(routes).find(
          k => k.toLowerCase().trim() === cleanText.toLowerCase()
        );
        if (matchedRouteKey) targetNodeId = routes[matchedRouteKey];
      }
      if (!targetNodeId && currentNode?.data?.nextStepId) {
        if (currentNode.data.nextStepId === 'END') {
          void saveLead(newLeadData, updatedDynamicFields);
          setCurrentNodeId(null);
          showThankYouOnce();
          return true;
        }
        targetNodeId = currentNode.data.nextStepId;
      }
      if (!targetNodeId) {
        const defaultEdge = safeEdges.find((e: any) => e.source === currentNode?.id && !e.sourceHandle);
        if (defaultEdge) targetNodeId = defaultEdge.target;
        else {
          const anyEdge = safeEdges.find((e: any) => e.source === currentNode?.id);
          if (anyEdge) targetNodeId = anyEdge.target;
        }
      }
      if (!targetNodeId) {
        const currentIdx = safeNodes.findIndex((n: any) => n.id === currentNode?.id);
        if (currentIdx !== -1 && currentIdx + 1 < safeNodes.length) targetNodeId = safeNodes[currentIdx + 1].id;
      }
      if (targetNodeId) {
        const nextNode = safeNodes.find((n: any) => n.id === targetNodeId);
        if (nextNode) {
          if (nextNode.type === 'saveLead') {
            void saveLead(newLeadData, updatedDynamicFields);
            setCurrentNodeId(null);
            showThankYouOnce();
            return true;
          }
          setCurrentNodeId(nextNode.id);
          processBotStep(nextNode);
          return true;
        }
      }

      void saveLead(newLeadData, updatedDynamicFields);
      setCurrentNodeId(null);
      showThankYouOnce();
      return true;
    } catch (error: any) {
      console.error('[PHONE_OTP_VERIFY_ERROR]', error);
      setOtpStage('verify');
      setOtpError(
        error?.code === 'auth/invalid-verification-code'
          ? 'Incorrect OTP. Please check the code and try again.'
          : 'The OTP could not be verified. Please try again.'
      );
      return false;
    }
  };

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

    // If the current phone step is waiting for OTP, the next user input is the code.
    if (otpStage === 'verify' && currentNode?.type === 'phone') {
      await verifyPhoneOtp(cleanText, currentNode);
      return;
    }

    // Phone answers must be verified before they are stored as lead data.
    if (currentNode?.type === 'phone') {
      await startPhoneOtp(cleanText);
      return;
    }

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
    }

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
          void saveLead(newLeadData, updatedDynamicFields);
          showThankYouOnce();
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
            // A saveLead node is terminal for lead capture. Do not continue into
            // another terminal/message node, otherwise multiple completion
            // messages can be generated from the same submission.
            void saveLead(newLeadData, updatedDynamicFields);
            setCurrentNodeId(null);
            showThankYouOnce();
            return;
          }

          setCurrentNodeId(nextNode.id);
          processBotStep(nextNode);
          return;
        }
      }

      // End of flow reached - save lead and send exactly one completion message.
      void saveLead(newLeadData, updatedDynamicFields);
      setCurrentNodeId(null);
      showThankYouOnce();
    } else {
      // Flow ended previously, user is continuing chat
      void saveLead(newLeadData, updatedDynamicFields);
      showThankYouOnce();
    }
  };

  const handleChoice = (choice: string) => {
    handleUserInput(choice);
  };

  const [isSubmitting, setIsSubmitting] = useState(false);

  const saveLead = async (data: any, fieldsList: Array<{ fieldId: string; label: string; value: string }> = dynamicFields) => {
    if (leadSubmittedRef.current || leadSubmitInFlightRef.current || isSubmitting) return;
    leadSubmitInFlightRef.current = true;
    setIsSubmitting(true);

    const effectiveClientId = localStorage.getItem('mintage_effective_user_id') || localStorage.getItem('mintage_client_id') || undefined;
    const payload = {
      botId,
      clientId: effectiveClientId,
      fields: fieldsList,
      sourceUrl: window.location.href,
      submittedAt: new Date().toISOString()
    };

    console.log('[LEAD] submitting', payload);

    const newLeadRecord: LeadRecord = {
      id: 'lead_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
      botId,
      flowId: botId,
      fields: fieldsList,
      data,
      sourceUrl: window.location.href,
      submittedAt: new Date().toISOString(),
      googleSheetSyncStatus: 'pending'
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
        newLeadRecord.googleSheetSyncStatus = resData.googleSheetSync?.status || 'pending';
        newLeadRecord.googleSheetSyncAction = resData.googleSheetSync?.action || null;
        leadSubmittedRef.current = true;
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

    // Completion UI is handled centrally by showThankYouOnce().
    // saveLead itself must never add a bot completion message.
    leadSubmitInFlightRef.current = false;
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

  return (
    <div className="flex flex-col h-full bg-gray-50 font-sans overflow-hidden border border-gray-100 rounded-2xl shadow-2xl">
      {/* Header */}
      <div className="bg-indigo-600 p-4 flex items-center gap-3 shadow-md">
        <div className="bg-white/20 p-2 rounded-lg">
          <Bot className="w-5 h-5 text-white" />
        </div>
        <div>
          <h3 className="text-white font-bold text-sm">{botTitle}</h3>
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
              <div className={`max-w-[80%] p-3 rounded-2xl text-sm shadow-sm ${msg.sender === 'user'
                ? 'bg-indigo-600 text-white rounded-tr-none'
                : 'bg-white text-gray-800 border border-gray-100 rounded-tl-none'
                }`}>
                {msg.imageUrl && (
                  <img
                    src={msg.imageUrl}
                    alt="Bot Attachment"
                    className="w-full h-auto max-h-48 object-cover rounded-xl mb-2 border border-gray-100"
                  />
                )}
                {msg.text && <p className="whitespace-pre-wrap">{msg.text}</p>}

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

      {/* User Input Area */}
      {!isTyping && (
        <>
          <div id={recaptchaContainerId} className="h-0 overflow-hidden" aria-hidden="true" />
          {otpError && (
            <div className="mx-3 mb-2 rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-[11px] font-medium text-red-600">
              {otpError}
            </div>
          )}
          <form
            onSubmit={(e) => { e.preventDefault(); if (inputValue.trim() && otpStage !== 'sending') handleUserInput(inputValue); }}
            className="p-3 bg-white border-t border-gray-100 flex gap-2 items-center"
          >
            <input
              type={otpStage === 'verify' ? 'tel' : 'text'}
              inputMode={otpStage === 'verify' ? 'numeric' : 'text'}
              maxLength={otpStage === 'verify' ? 6 : undefined}
              value={inputValue}
              onChange={(e) => {
                const value = otpStage === 'verify' ? e.target.value.replace(/\D/g, '').slice(0, 6) : e.target.value;
                setInputValue(value);
              }}
              placeholder={
                otpStage === 'sending' ? 'Sending OTP...' :
                  otpStage === 'verify' ? 'Enter 6-digit OTP...' :
                    currentNode?.type === 'name' ? 'Type your full name...' :
                      currentNode?.type === 'phone' ? 'Type your phone number...' :
                        currentNode?.type === 'email' ? 'Type your email address...' :
                          'Type your response...'
              }
              className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-xs font-medium text-gray-800 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
              disabled={otpStage === 'sending'}
              autoComplete={otpStage === 'verify' ? 'one-time-code' : 'tel'}
            />
            <button
              type="submit"
              disabled={!inputValue.trim() || otpStage === 'sending'}
              className="bg-indigo-600 text-white p-2.5 rounded-xl hover:bg-indigo-700 transition-all shadow-md shadow-indigo-100 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {otpStage === 'sending' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
          </form>
        </>
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
