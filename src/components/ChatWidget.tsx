import React, { useState, useEffect, useRef } from 'react';
import { db } from '../lib/firebase';
import { doc, getDoc, getDocs, collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { motion, AnimatePresence } from 'motion/react';
import { Send, Bot, Loader2, ChevronRight, Minus, X, Phone, CalendarDays, MessageCircle, Headphones, ExternalLink } from 'lucide-react';

interface ChatWidgetProps {
  botId: string;
}

interface Message {
  id: string;
  text: string;
  sender: 'bot' | 'user';
  type?: string;
  choices?: string[];
  optionUrls?: Record<string, string>;
  imageUrl?: string;
  url?: string;
  urlLabel?: string;
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
  const [isMinimized, setIsMinimized] = useState(false);
  const [design, setDesign] = useState<any>({});
  const [clientLogo, setClientLogo] = useState('');

  const welcomeTitle = design.welcomeTitle || `Welcome to ${botTitle}!`;
  const welcomeDescription = design.welcomeDescription || design.subtitle || 'How can we help you today?';

  // Allow normal web links plus common contact/navigation links such as
  // Google Maps, phone numbers, email and WhatsApp links.
  const isAllowedLink = (value: string) => /^(https?:\/\/|mailto:|tel:|whatsapp:)/i.test(String(value || '').trim());
  const renderHeaderAvatar = () => {
    if (design.avatarUrl) {
      return <img src={design.avatarUrl} alt={design.botTitle || botTitle} className="w-full h-full object-cover" />;
    }
    return <Bot className="w-5 h-5" />;
  };

  const renderCtaIcon = (icon: string) => {
    switch (String(icon).toLowerCase()) {
      case 'phone': case 'callback': return <Phone className="w-3.5 h-3.5" />;
      case 'calendar': case 'appointment': return <CalendarDays className="w-3.5 h-3.5" />;
      case 'whatsapp': return <MessageCircle className="w-3.5 h-3.5" />;
      case 'headset': case 'team': return <Headphones className="w-3.5 h-3.5" />;
      default: return <ChevronRight className="w-3.5 h-3.5" />;
    }
  };

  const handleCtaAction = (action: string) => {
    const value = String(action || '').trim();
    if (!value) return;
    if (isAllowedLink(value)) {
      window.open(value, '_blank', 'noopener,noreferrer');
      return;
    }
    if (value === 'callback' || value === 'appointment' || value === 'contact') {
      setInputValue('');
      const target = safeNodes.find((n: any) => ['phone', 'name', 'email'].includes(n.type));
      if (target) {
        setCurrentNodeId(target.id);
        setMessages(prev => [...prev, {
          id: `cta-${Date.now()}`,
          text: value === 'appointment' ? 'Sure! Let’s get your details and help you book an appointment.' : 'Sure! Please share your details and our team will get in touch with you.',
          sender: 'bot'
        }]);
      }
    }
  };

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

  // Prevent duplicate lead submissions and duplicate completion messages.
  const leadSubmitInFlightRef = useRef(false);
  const leadSubmittedRef = useRef(false);
  const leadSubmissionKeyRef = useRef<string | null>(null);
  const thankYouShownRef = useRef(false);

  const showThankYouOnce = () => {
    // Guard at component level.
    if (thankYouShownRef.current) return;

    // Guard at browser-session level so a remount/re-render cannot generate
    // the same completion message again for the same bot conversation.
    const thankYouKey = `mintage_thankyou_${botId}_${conversationId || chatUserId}`;
    try {
      if (sessionStorage.getItem(thankYouKey) === '1') {
        thankYouShownRef.current = true;
        return;
      }
      sessionStorage.setItem(thankYouKey, '1');
    } catch {
      // Fall back to the in-memory ref if sessionStorage is unavailable.
    }

    thankYouShownRef.current = true;

    // Show completion immediately. Lead persistence / Google Sheets sync must
    // never delay the customer-facing thank-you response.
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
        optionUrls: node.data?.optionUrls,
        imageUrl: node.data?.imageUrl,
        url: node.data?.url || node.data?.linkUrl || '',
        urlLabel: node.data?.urlLabel || 'Open link',
      };
      setMessages(prev => [...prev, newMessage]);

      // Track bot response in Firebase / Backend
      if (newMessage.text) {
        trackMessageToBackend('bot', newMessage.text, node.type || 'text');
      }

      // Check if this node is non-interactive (does not require user input)
      const isInteractive = ['name', 'email', 'phone', 'textQuestion', 'singleChoice', 'multipleChoice', 'dateTime'].includes(node.type);

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
      setDesign(botData.designConfig || botData.design || {});
      setClientLogo(botData.clientLogo || botData.logo || botData.designConfig?.avatarUrl || botData.design?.avatarUrl || '');

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

  const isPhoneNode = (node: any) => {
    if (!node) return false;
    const type = String(node.type || '').trim().toLowerCase();
    if (type === 'phone' || type === 'phonequestion' || type === 'phone_question') return true;

    const key = String(
      node.data?.key ||
      node.data?.leadKey ||
      node.data?.fieldKey ||
      ''
    ).trim().toLowerCase();

    if (['phone', 'phone_number', 'phonenumber', 'mobile', 'mobile_number'].includes(key)) {
      return true;
    }

    const label = String(node.data?.label || '').toLowerCase();
    return /\b(phone|mobile)\b/.test(label) && !/email/.test(label);
  };

  const getLocalDateTimeMin = () => {
    const now = new Date();
    const pad = (value: number) => String(value).padStart(2, '0');
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
  };

  const validateLeadField = (node: any, value: string): string | null => {
    const cleanValue = String(value || '').trim();
    if (!node || !cleanValue) return null;

    const type = String(node.type || '').trim().toLowerCase();
    const key = String(
      node.data?.key ||
      node.data?.leadKey ||
      node.data?.fieldKey ||
      ''
    ).trim().toLowerCase();
    const label = String(node.data?.label || '').trim().toLowerCase();

    const isNameField = type === 'name' ||
      ['name', 'full_name', 'fullname'].includes(key) ||
      /\b(full\s*name|name)\b/.test(label);

    const isEmailField = type === 'email' ||
      ['email', 'email_address', 'emailaddress'].includes(key) ||
      /\bemail\b/.test(label);

    const isPhoneField = isPhoneNode(node) ||
      ['phone', 'phone_number', 'phonenumber', 'mobile', 'mobile_number', 'contact_number'].includes(key) ||
      /\b(phone|mobile|contact\s*(number|no\.?))\b/.test(label);

    if (isNameField) {
      // Supports normal names, spaces, hyphens, apostrophes and Unicode letters.
      const normalizedName = cleanValue.replace(/\s+/g, ' ');
      if (normalizedName.length < 2 || normalizedName.length > 80) {
        return 'Please enter your full name (2–80 characters).';
      }
      if (!/^[\p{L}\p{M}]+(?:[ .\u0027\u2019-][\p{L}\p{M}]+)*$/u.test(normalizedName)) {
        return 'Please enter a valid name using letters, spaces, hyphens or apostrophes only.';
      }
      return null;
    }

    if (isPhoneField) {
      // Accept common international formatting while validating the actual digit count.
      const phoneDigits = cleanValue.replace(/\D/g, '');
      if (!/^[+\d][\d\s().-]*$/.test(cleanValue)) {
        return 'Please enter a valid phone number using digits only (formatting such as +, spaces or hyphens is allowed).';
      }
      if (phoneDigits.length < 10 || phoneDigits.length > 15) {
        return 'Please enter a valid phone number with 10–15 digits.';
      }
      return null;
    }

    if (isEmailField) {
      if (cleanValue.length > 254 || /\s/.test(cleanValue)) {
        return 'Please enter a valid email address.';
      }
      // Practical email format check for lead capture. The server repeats this validation.
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/i.test(cleanValue)) {
        return 'Please enter a valid email address, for example name@example.com.';
      }
      return null;
    }

    if (type === 'datetime' || type === 'dateTime'.toLowerCase() || /\b(date\s*[/&-]?\s*time|date and time)\b/i.test(label)) {
      // datetime-local values are intentionally kept as the exact local date/time
      // selected by the visitor. Do not silently convert them to UTC.
      if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(cleanValue)) {
        return 'Please select a valid date and time.';
      }

      const selected = new Date(cleanValue.length === 16 ? `${cleanValue}:00` : cleanValue);
      const now = new Date();
      if (Number.isNaN(selected.getTime()) || selected.getTime() < now.getTime()) {
        return 'Please select the current date/time or a future date/time. Previous dates are not allowed.';
      }
    }

    return null;
  };

  const handleUserInput = async (text: string) => {
    const cleanText = text.trim();
    if (!cleanText) return;

    const currentNode = safeNodes.find((n: any) => n.id === currentNodeId);

    // Validate name, phone and email before storing/tracking the answer or moving
    // to the next node. Invalid values stay in the input so the user can correct them.
    const validationError = validateLeadField(currentNode, cleanText);
    if (validationError) {
      setMessages(prev => [
        ...prev,
        {
          id: `validation-${Date.now()}`,
          text: validationError,
          sender: 'bot',
          type: 'validation-error'
        }
      ]);
      return;
    }

    const userMsg: Message = {
      id: Date.now().toString(),
      text: cleanText,
      sender: 'user',
    };
    setMessages(prev => [...prev, userMsg]);
    setInputValue('');

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
      } else if (isPhoneNode(currentNode)) {
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
          showThankYouOnce();
          void saveLead(newLeadData, updatedDynamicFields);
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
            setCurrentNodeId(null);
            showThankYouOnce();
            void saveLead(newLeadData, updatedDynamicFields);
            return;
          }

          setCurrentNodeId(nextNode.id);
          processBotStep(nextNode);
          return;
        }
      }

      // End of flow reached - save lead and send exactly one completion message.
      setCurrentNodeId(null);
      showThankYouOnce();
      void saveLead(newLeadData, updatedDynamicFields);
    } else {
      // Flow ended previously, user is continuing chat
      showThankYouOnce();
      void saveLead(newLeadData, updatedDynamicFields);
    }
  };

  const handleChoice = (choice: string, url?: string) => {
    const cleanUrl = String(url || '').trim();
    if (cleanUrl && isAllowedLink(cleanUrl)) {
      window.open(cleanUrl, '_blank', 'noopener,noreferrer');
      return;
    }
    handleUserInput(choice);
  };

  const [isSubmitting, setIsSubmitting] = useState(false);

  const saveLead = async (data: any, fieldsList: Array<{ fieldId: string; label: string; value: string }> = dynamicFields) => {
    const submissionKey = `${botId}::${conversationId || chatUserId}`;
    if (leadSubmittedRef.current || leadSubmitInFlightRef.current || isSubmitting || leadSubmissionKeyRef.current === submissionKey) return;
    leadSubmissionKeyRef.current = submissionKey;
    leadSubmitInFlightRef.current = true;
    setIsSubmitting(true);

    const effectiveClientId = localStorage.getItem('mintage_effective_user_id') || localStorage.getItem('mintage_client_id') || undefined;
    const payload = {
      botId,
      clientId: effectiveClientId,
      userId: chatUserId,
      chatUserId,
      conversationId: conversationId || '',
      fields: fieldsList,
      // Used only by the server to validate datetime-local values against the
      // visitor's local clock. The selected field value itself remains unchanged.
      clientTimezoneOffsetMinutes: new Date().getTimezoneOffset(),
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

    let leadSubmissionSucceeded = false;
    try {
      const res = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const resData = await res.json();
      if (res.ok && resData.success) {
        leadSubmissionSucceeded = true;
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
    if (!leadSubmissionSucceeded) {
      leadSubmissionKeyRef.current = null;
    }
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
      {/* Customer-facing header */}
      <div
        className="p-4 flex items-center gap-3 shadow-md transition-all shrink-0"
        style={{ background: design.headerBgColor || '#4f46e5', color: design.headerTextColor || '#ffffff' }}
      >
        <div className="w-10 h-10 rounded-full bg-white/15 backdrop-blur-md flex items-center justify-center overflow-hidden border border-white/20 shrink-0">
          {clientLogo ? (
            <img src={clientLogo} alt={design.botTitle || botTitle} className="w-full h-full object-cover" />
          ) : renderHeaderAvatar()}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-bold text-sm truncate" style={{ color: design.headerTextColor || '#ffffff' }}>
            {design.botTitle || botTitle}
          </h3>
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
            <span className="text-[10px] font-medium uppercase tracking-wider opacity-90" style={{ color: design.headerTextColor || '#ffffff' }}>
              {design.subtitle || 'Online'}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button type="button" aria-label="Minimize chat" onClick={() => { setIsMinimized(true); try { window.parent?.postMessage({ type: 'MINTAGE_BOT_MINIMIZE' }, '*'); } catch { } }} className="p-2 rounded-lg hover:bg-white/10 transition">
            <Minus className="w-4 h-4" />
          </button>
          <button type="button" aria-label="Close chat" onClick={() => { try { window.parent?.postMessage({ type: 'MINTAGE_BOT_CLOSE' }, '*'); } catch { } }} className="p-2 rounded-lg hover:bg-white/10 transition">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {isMinimized ? (
        <div className="flex-1 flex items-center justify-center p-6 text-center">
          <button type="button" onClick={() => setIsMinimized(false)} className="px-5 py-3 rounded-2xl font-semibold text-sm shadow-sm" style={{ background: design.accentColor || '#4f46e5', color: '#fff' }}>
            Reopen chat
          </button>
        </div>
      ) : null}

      {/* Messages + welcome experience */}
      {!isMinimized && <div className="flex-1 overflow-y-auto p-4 space-y-4 scroll-smooth">
        <AnimatePresence initial={false}>
          {messages.map((msg) => (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[82%] p-3 rounded-2xl text-sm shadow-sm transition-all ${msg.sender === 'user' ? 'rounded-tr-none' : 'rounded-tl-none border'}`}
                style={msg.sender === 'user'
                  ? { background: design.userBubbleBg || '#4f46e5', color: design.userBubbleText || '#ffffff' }
                  : { background: design.botBubbleBg || '#ffffff', color: design.botBubbleText || '#1e293b', borderColor: `${design.accentColor || '#4f46e5'}18` }}
              >
                {msg.url && isAllowedLink(msg.url) && (
                  <a
                    href={msg.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 w-full inline-flex items-center justify-center gap-2 p-2.5 bg-indigo-50 hover:bg-indigo-100 border border-indigo-100 rounded-xl text-xs font-bold text-indigo-600 transition-all"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>{msg.urlLabel || 'Open link'}</span>
                  </a>
                )}

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
                    {msg.choices.map((choice, i) => {
                      const choiceUrl = msg.optionUrls?.[choice] || '';
                      return (
                        <button
                          key={i}
                          onClick={() => handleChoice(choice, choiceUrl)}
                          className="w-full text-left p-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-between group border"
                          style={{ borderColor: `${design.accentColor || '#4f46e5'}35`, color: design.accentColor || '#4f46e5', backgroundColor: `${design.accentColor || '#4f46e5'}0a` }}
                        >
                          <span className="flex items-center gap-2">
                            {choice}
                            {choiceUrl && <span className="text-[10px] opacity-70">↗</span>}
                          </span>
                          <ChevronRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </button>
                      );
                    })}
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
                <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: design.accentColor || '#4f46e5' }}></span>
                <span className="w-1.5 h-1.5 rounded-full animate-bounce [animation-delay:0.2s]" style={{ background: design.accentColor || '#4f46e5' }}></span>
                <span className="w-1.5 h-1.5 rounded-full animate-bounce [animation-delay:0.4s]" style={{ background: design.accentColor || '#4f46e5' }}></span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <div ref={messagesEndRef} />
      </div>}

      {/* User Input Area */}
      {!isMinimized && !isTyping && (
        <form
          onSubmit={(e) => { e.preventDefault(); if (inputValue.trim()) handleUserInput(inputValue); }}
          className="p-3 border-t flex gap-2 items-center" style={{ background: design.botBubbleBg || '#ffffff', borderColor: `${design.accentColor || '#4f46e5'}12` }}
        >
          <input
            type={
              currentNode?.type === 'email' ? 'email' :
                currentNode?.type === 'dateTime' ? 'datetime-local' : 'text'
            }
            inputMode={
              isPhoneNode(currentNode) ? 'tel' :
                currentNode?.type === 'email' ? 'email' :
                  currentNode?.type === 'dateTime' ? 'datetime' : 'text'
            }
            autoComplete={
              currentNode?.type === 'name' ? 'name' :
                isPhoneNode(currentNode) ? 'tel' :
                  currentNode?.type === 'email' ? 'email' : 'off'
            }
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            min={currentNode?.type === 'dateTime' ? getLocalDateTimeMin() : undefined}
            placeholder={
              currentNode?.type === 'name' ? 'Type your full name...' :
                isPhoneNode(currentNode) ? 'Type your phone number...' :
                  currentNode?.type === 'email' ? 'Type your email address...' :
                    currentNode?.type === 'dateTime' ? 'Select date and time...' :
                      'Type your response...'
            }
            className="flex-1 border rounded-xl px-4 py-2.5 text-xs font-medium outline-none transition-all" style={{ background: design.widgetBgColor || '#f8fafc', color: design.botBubbleText || '#1e293b', borderColor: `${design.accentColor || '#4f46e5'}25` }}
          />
          <button
            type="submit"
            disabled={!inputValue.trim()}
            className="text-white p-2.5 rounded-xl transition-all shadow-md disabled:opacity-40 disabled:cursor-not-allowed" style={{ background: design.accentColor || '#4f46e5' }}
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      )}

    </div>
  );
}
