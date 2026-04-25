import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { api, getAuthToken, setAuthToken } from './src/api';
import type {
  AppNotification,
  AuthResponse,
  CommunityEvent,
  DiscoveryCard,
  LearningPlan,
  MessageThread,
  Messages,
  PublicOverview,
  Session,
  Tab,
  User,
} from './src/types';

const tabs: Tab[] = ['Discover', 'Sessions', 'Community', 'Progress', 'Profile'];
const personas = ['All', 'teacher', 'learner'] as const;
const TOKEN_KEY = 'skillsswap_token';

const local = (globalThis as { localStorage?: Storage }).localStorage;
const readStoredToken = () => local?.getItem(TOKEN_KEY) ?? '';
const storeToken = (token: string) => local?.setItem(TOKEN_KEY, token);
const clearToken = () => local?.removeItem(TOKEN_KEY);
const PRODUCTION_API_BASE = 'https://skills-swap-kappa.vercel.app/api';
const configuredApiBase =
  process.env.EXPO_PUBLIC_API_BASE || PRODUCTION_API_BASE;
const isWeb = Platform.OS === 'web';
const calendarBaseUrl =
  isWeb
    ? window.location.origin
    : configuredApiBase.replace(/\/api$/, '') || 'https://skills-swap-kappa.vercel.app';

const completeProfile = (user: User | null) =>
  Boolean(
    user &&
      user.headline &&
      user.bio &&
      user.country &&
      user.skillsOffered.length &&
      user.skillsToLearn.length
  );

const pageMeta: Record<Tab, { label: string; eyebrow: string }> = {
  Discover: { label: 'Dashboard', eyebrow: 'YOUR NETWORK' },
  Sessions: { label: 'Sessions', eyebrow: 'SCHEDULE & FOLLOW-THROUGH' },
  Community: { label: 'Community', eyebrow: 'EVENTS & CONVERSATIONS' },
  Progress: { label: 'Progress', eyebrow: 'MOMENTUM & GOALS' },
  Profile: { label: 'Profile', eyebrow: 'MEMBER IDENTITY' },
};

const mobileTabLabel: Record<Tab, string> = {
  Discover: 'Home',
  Sessions: 'Sessions',
  Community: 'Community',
  Progress: 'Progress',
  Profile: 'Profile',
};

const iconForTab = (tab: Tab) => {
  if (tab === 'Discover') return 'Home';
  if (tab === 'Sessions') return 'Calendar';
  if (tab === 'Community') return 'Circle';
  if (tab === 'Progress') return 'Growth';
  return 'Profile';
};

const personaLabel = (value: (typeof personas)[number]) => {
  if (value === 'teacher') return 'Mentors';
  if (value === 'learner') return 'Explorers';
  return 'Everyone';
};

export default function App() {
  const { width } = useWindowDimensions();
  const isWide = width >= 1180;
  const isTablet = width >= 900;
  const isPhone = width < 640;
  const contentOpacity = useRef(new Animated.Value(1)).current;
  const contentLift = useRef(new Animated.Value(0)).current;

  const [booting, setBooting] = useState(true);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState('');
  const [user, setUser] = useState<User | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('Discover');
  const [error, setError] = useState('');
  const [publicOverview, setPublicOverview] = useState<PublicOverview | null>(null);

  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [authName, setAuthName] = useState('');
  const [authEmail, setAuthEmail] = useState('demo@skillsswap.app');
  const [authPassword, setAuthPassword] = useState('demo123');

  const [profileName, setProfileName] = useState('');
  const [profileHeadline, setProfileHeadline] = useState('');
  const [profileBio, setProfileBio] = useState('');
  const [profileCountry, setProfileCountry] = useState('');
  const [profileOffered, setProfileOffered] = useState('');
  const [profileLearn, setProfileLearn] = useState('');
  const [profileModal, setProfileModal] = useState(false);

  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All');
  const [persona, setPersona] = useState<(typeof personas)[number]>('All');
  const [categories, setCategories] = useState<string[]>(['All']);
  const [cards, setCards] = useState<DiscoveryCard[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [events, setEvents] = useState<CommunityEvent[]>([]);
  const [plan, setPlan] = useState<LearningPlan | null>(null);
  const [messages, setMessages] = useState<Messages>({ unreadCount: 0 });
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [threads, setThreads] = useState<MessageThread[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [bookingCard, setBookingCard] = useState<DiscoveryCard | null>(null);
  const [slot, setSlot] = useState('');

  const completedCount = useMemo(
    () =>
      plan
        ? [plan.profileCompleted, plan.firstSessionBooked, plan.challengeJoined].filter(Boolean)
            .length
        : 0,
    [plan]
  );

  const mentorCount = useMemo(
    () => cards.filter((card) => card.persona === 'teacher').length,
    [cards]
  );
  const learnerCount = useMemo(
    () => cards.filter((card) => card.persona === 'learner').length,
    [cards]
  );
  const upcomingSessions = useMemo(
    () => sessions.filter((session) => session.status === 'upcoming'),
    [sessions]
  );
  const liveSessions = useMemo(
    () => sessions.filter((session) => session.status === 'live'),
    [sessions]
  );
  const completedSessions = useMemo(
    () => sessions.filter((session) => session.status === 'completed'),
    [sessions]
  );
  const savedCards = useMemo(
    () => cards.filter((card) => card.favorited),
    [cards]
  );
  const connectedCards = useMemo(
    () => cards.filter((card) => card.connected),
    [cards]
  );
  const recommendedCards = useMemo(
    () => cards.slice(0, isWide ? 6 : isPhone ? 3 : 4),
    [cards, isPhone, isWide]
  );
  const phoneRecommendedCards = useMemo(
    () => cards.slice(0, 6),
    [cards]
  );
  const unreadNotifications = useMemo(
    () => notifications.filter((item) => !item.read).length,
    [notifications]
  );

  useEffect(() => {
    contentOpacity.setValue(0.34);
    contentLift.setValue(16);
    Animated.parallel([
      Animated.timing(contentOpacity, {
        toValue: 1,
        duration: 240,
        useNativeDriver: true,
      }),
      Animated.timing(contentLift, {
        toValue: 0,
        duration: 240,
        useNativeDriver: true,
      }),
    ]).start();
  }, [activeTab, contentLift, contentOpacity]);

  const hydrateUser = (next: User) => {
    setUser(next);
    setProfileName(next.name);
    setProfileHeadline(next.headline);
    setProfileBio(next.bio);
    setProfileCountry(next.country);
    setProfileOffered(next.skillsOffered.join(', '));
    setProfileLearn(next.skillsToLearn.join(', '));
  };

  const resetAppData = () => {
    setCategories(['All']);
    setCards([]);
    setSessions([]);
    setEvents([]);
    setPlan(null);
    setMessages({ unreadCount: 0 });
    setNotifications([]);
    setThreads([]);
    setDrafts({});
    setBookingCard(null);
    setSlot('');
  };

  const loadPublicOverview = async () => {
    try {
      const overview = await api.publicOverview();
      setPublicOverview(overview);
    } catch {
      setPublicOverview(null);
    }
  };

  const loadAll = async () => {
    const [
      nextCategories,
      nextCards,
      nextSessions,
      nextEvents,
      nextPlan,
      nextMessages,
      nextNotifications,
      nextThreads,
    ] = await Promise.all([
      api.categories(),
      api.discovery(query, category, persona),
      api.sessions(),
      api.events(),
      api.learningPlan(),
      api.messages(),
      api.notifications(),
      api.messageThreads(),
    ]);

    setCategories(['All', ...nextCategories]);
    setCards(nextCards);
    setSessions(nextSessions);
    setEvents(nextEvents);
    setPlan(nextPlan);
    setMessages(nextMessages);
    setNotifications(nextNotifications);
    setThreads(nextThreads);
  };

  useEffect(() => {
    void loadPublicOverview();
  }, []);

  useEffect(() => {
    const init = async () => {
      const existing = readStoredToken();
      if (!existing) {
        setAuthToken('');
        resetAppData();
        setBooting(false);
        setLoading(false);
        return;
      }

      setToken(existing);
      setAuthToken(existing);
      try {
        const me = await api.me();
        hydrateUser(me.user);
        await loadAll();
      } catch {
        clearToken();
        setAuthToken('');
        setToken('');
        setUser(null);
        resetAppData();
      } finally {
        setBooting(false);
        setLoading(false);
      }
    };

    void init();
  }, []);

  useEffect(() => {
    if (!token || !user) return;
    void api.discovery(query, category, persona).then(setCards).catch(() => {});
  }, [query, category, persona, token, user]);

  useEffect(() => {
    if (!token || !user) return;
    const timer = setInterval(() => {
      void Promise.all([api.messages(), api.notifications(), api.messageThreads()]).then(
        ([nextMessages, nextNotifications, nextThreads]) => {
          setMessages(nextMessages);
          setNotifications(nextNotifications);
          setThreads(nextThreads);
        }
      );
    }, 10000);

    return () => clearInterval(timer);
  }, [token, user]);

  const onAuth = async () => {
    setError('');
    try {
      setLoading(true);
      let result: AuthResponse;
      if (authMode === 'register') {
        result = await api.register(authName.trim(), authEmail.trim(), authPassword);
      } else {
        result = await api.login(authEmail.trim(), authPassword);
      }
      setAuthToken(result.token);
      storeToken(result.token);
      setToken(result.token);
      hydrateUser(result.user);
      await loadAll();
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  const saveProfile = async () => {
    if (!user) return;
    const offered = profileOffered
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
    const learn = profileLearn
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);

    const updated = await api.saveProfile({
      name: profileName.trim(),
      headline: profileHeadline.trim(),
      bio: profileBio.trim(),
      country: profileCountry.trim(),
      skillsOffered: offered,
      skillsToLearn: learn,
    });

    hydrateUser(updated);
    await loadAll();
    setProfileModal(false);
  };

  const onLogout = () => {
    clearToken();
    setAuthToken('');
    setToken('');
    setUser(null);
    setError('');
    setLoading(false);
    resetAppData();
  };

  const updateCard = (id: string, nextCard: DiscoveryCard) => {
    setCards((previous) => previous.map((item) => (item.id === id ? nextCard : item)));
  };

  const renderStatCard = (value: string, label: string, detail: string) => (
    <View style={[styles.statCard, isPhone && styles.statCardPhone]}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statDetail}>{detail}</Text>
    </View>
  );

  const renderMemberCard = (card: DiscoveryCard, compact?: boolean) => (
    <View
      key={card.id}
      style={[
        styles.memberCard,
        compact && styles.memberCardCompact,
        isPhone && styles.memberCardPhone,
      ]}
    >
      <View style={[styles.rowBetween, isPhone && styles.rowBetweenPhone]}>
        <View style={styles.memberBadge}>
          <Text style={styles.memberBadgeText}>
            {card.persona === 'teacher' ? 'MENTOR' : 'EXPLORER'}
          </Text>
        </View>
        <Text style={styles.memberRating}>{card.rating.toFixed(1)}</Text>
      </View>
      <Text style={styles.memberName}>{card.name}</Text>
      <Text style={styles.memberMeta}>
        {card.title} · {card.country}
      </Text>
      <Text style={styles.memberSkill}>{card.skill}</Text>
      <Text style={styles.memberBio}>{card.bio}</Text>
      <View style={[styles.slotRow, isPhone && styles.slotRowPhone]}>
        {card.nextSessionSlots.slice(0, compact ? 1 : 2).map((nextSlot) => (
          <View key={nextSlot} style={styles.slotChip}>
            <Text style={styles.slotChipText}>{nextSlot}</Text>
          </View>
        ))}
      </View>
      {token && user ? (
        <View style={[styles.actionRow, isPhone && styles.actionRowPhone]}>
          <Pressable
            style={({ pressed }) => [styles.primaryButton, pressed && styles.pressedScale]}
            onPress={() => api.toggleConnect(card.id).then((updated) => updateCard(card.id, updated))}
          >
            <Text style={styles.primaryButtonText}>
              {card.connected ? 'Connected' : 'Connect'}
            </Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.softButton, pressed && styles.pressedScale]}
            onPress={() => api.toggleFavorite(card.id).then((updated) => updateCard(card.id, updated))}
          >
            <Text style={styles.softButtonText}>
              {card.favorited ? 'Saved' : 'Save'}
            </Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.ghostButton, pressed && styles.pressedScale]}
            onPress={() => {
              setBookingCard(card);
              setSlot(card.nextSessionSlots[0] ?? '');
            }}
          >
            <Text style={styles.ghostButtonText}>Book</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );

  const renderMobileMemberCard = (card: DiscoveryCard) => (
    <View key={card.id} style={styles.mobileMemberCard}>
      <View style={styles.rowBetween}>
        <View style={styles.memberBadge}>
          <Text style={styles.memberBadgeText}>
            {card.persona === 'teacher' ? 'MENTOR' : 'EXPLORER'}
          </Text>
        </View>
        <Text style={styles.memberRating}>{card.rating.toFixed(1)}</Text>
      </View>
      <Text style={styles.memberName}>{card.name}</Text>
      <Text style={styles.memberMeta}>
        {card.title} · {card.country}
      </Text>
      <Text style={styles.memberSkill}>{card.skill}</Text>
      <Text style={styles.memberBio}>{card.bio}</Text>
      <View style={styles.mobileSlotRow}>
        {card.nextSessionSlots.slice(0, 2).map((nextSlot) => (
          <View key={nextSlot} style={styles.mobileSlotChip}>
            <Text style={styles.slotChipText}>{nextSlot}</Text>
          </View>
        ))}
      </View>
      {token && user ? (
        <View style={styles.mobileActionRow}>
          <Pressable
            style={({ pressed }) => [styles.mobilePrimaryButton, pressed && styles.pressedScale]}
            onPress={() => api.toggleConnect(card.id).then((updated) => updateCard(card.id, updated))}
          >
            <Text style={styles.primaryButtonText}>
              {card.connected ? 'Connected' : 'Connect'}
            </Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.mobileSecondaryButton, pressed && styles.pressedScale]}
            onPress={() => api.toggleFavorite(card.id).then((updated) => updateCard(card.id, updated))}
          >
            <Text style={styles.softButtonText}>
              {card.favorited ? 'Saved' : 'Save'}
            </Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.mobileOutlineButton, pressed && styles.pressedScale]}
            onPress={() => {
              setBookingCard(card);
              setSlot(card.nextSessionSlots[0] ?? '');
            }}
          >
            <Text style={styles.ghostButtonText}>Book</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );

  const renderLanding = () => (
    isPhone ? (
      <SafeAreaView style={styles.safe}>
        <StatusBar style="light" />
        <ScrollView contentContainerStyle={[styles.landingScroll, styles.landingScrollPhone]}>
          <LinearGradient colors={['#0d1c17', '#15342b', '#285848']} style={[styles.landingHero, styles.landingHeroPhone]}>
            <View style={styles.landingCopyPhone}>
              <Text style={styles.eyebrow}>PRIVATE SKILL EXCHANGE</Text>
              <Text style={[styles.landingTitle, styles.landingTitlePhone]}>
                Learn with the right people in a cleaner mobile flow.
              </Text>
              <Text style={styles.landingBody}>
                SkillSwap combines discovery, sessions, community, and progress tracking in one focused mobile app.
              </Text>
              <Pressable
                style={({ pressed }) => [styles.heroButton, pressed && styles.pressedScale]}
                onPress={onAuth}
              >
                <Text style={styles.heroButtonText}>
                  {authMode === 'register' ? 'Create account' : 'Enter SkillSwap'}
                </Text>
              </Pressable>
              <View style={styles.demoStrip}>
                <Text style={styles.demoStripText}>demo@skillsswap.app · demo123</Text>
              </View>
            </View>
          </LinearGradient>

          <View style={[styles.surfaceCard, styles.surfaceCardPhone]}>
            {renderPhoneSectionTitle('Live network snapshot')}
            <View style={styles.featureList}>
              <View style={styles.listRow}>
                <Text style={styles.listRowTitle}>Members</Text>
                <Text style={styles.listRowMeta}>{publicOverview?.totalMembers ?? 0}</Text>
              </View>
              <View style={styles.listRow}>
                <Text style={styles.listRowTitle}>Mentors</Text>
                <Text style={styles.listRowMeta}>{publicOverview?.mentorCount ?? 0}</Text>
              </View>
              <View style={styles.listRow}>
                <Text style={styles.listRowTitle}>Explorers</Text>
                <Text style={styles.listRowMeta}>{publicOverview?.learnerCount ?? 0}</Text>
              </View>
              <View style={styles.listRow}>
                <Text style={styles.listRowTitle}>Sessions</Text>
                <Text style={styles.listRowMeta}>{publicOverview?.sessionCount ?? 0}</Text>
              </View>
            </View>
          </View>

          <View style={[styles.authCard, styles.authCardPhone]}>
            <Text style={styles.authCardTitle}>Join SkillSwap</Text>
            <Text style={styles.authCardText}>
              Sign in to access bookings, saved profiles, messages, events, and personal progress.
            </Text>
            <View style={styles.toggleRow}>
              <Pressable
                style={({ pressed }) => [
                  styles.modeChip,
                  authMode === 'login' && styles.modeChipActive,
                  pressed && styles.pressedScale,
                ]}
                onPress={() => setAuthMode('login')}
              >
                <Text
                  style={[
                    styles.modeChipText,
                    authMode === 'login' && styles.modeChipTextActive,
                  ]}
                >
                  Login
                </Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [
                  styles.modeChip,
                  authMode === 'register' && styles.modeChipActive,
                  pressed && styles.pressedScale,
                ]}
                onPress={() => setAuthMode('register')}
              >
                <Text
                  style={[
                    styles.modeChipText,
                    authMode === 'register' && styles.modeChipTextActive,
                  ]}
                >
                  Register
                </Text>
              </Pressable>
            </View>
            {authMode === 'register' ? (
              <TextInput
                style={styles.input}
                value={authName}
                onChangeText={setAuthName}
                placeholder="Your name"
                placeholderTextColor="#7a8a84"
              />
            ) : null}
            <TextInput
              style={styles.input}
              value={authEmail}
              onChangeText={setAuthEmail}
              placeholder="Email"
              placeholderTextColor="#7a8a84"
            />
            <TextInput
              style={styles.input}
              value={authPassword}
              onChangeText={setAuthPassword}
              placeholder="Password"
              placeholderTextColor="#7a8a84"
              secureTextEntry
            />
            <Pressable
              style={({ pressed }) => [styles.primaryWideButton, pressed && styles.pressedScale]}
              onPress={onAuth}
            >
              <Text style={styles.primaryWideButtonText}>
                {authMode === 'register' ? 'Create account' : 'Continue'}
              </Text>
            </Pressable>
            {error ? <Text style={styles.error}>{error}</Text> : null}
          </View>

          <View style={styles.infoCard}>
            <Text style={styles.infoCardTitle}>Popular categories</Text>
            <View style={styles.tagWrap}>
              {(publicOverview?.categories ?? []).map((item) => (
                <View key={item} style={styles.tag}>
                  <Text style={styles.tagText}>{item}</Text>
                </View>
              ))}
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    ) : (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.landingScroll}>
        <LinearGradient colors={['#0d1c17', '#15342b', '#285848']} style={styles.landingHero}>
          <View style={[styles.landingHeroInner, isWide && styles.landingHeroInnerWide]}>
            <View style={[styles.landingCopy, isPhone && styles.landingCopyPhone]}>
              <Text style={styles.eyebrow}>PRIVATE SKILL EXCHANGE</Text>
              <Text style={[styles.landingTitle, isPhone && styles.landingTitlePhone]}>
                A calmer, higher-signal way to learn from people who actually do the work.
              </Text>
              <Text style={styles.landingBody}>
                SkillSwap blends mentorship, peer exchange, events, messaging, and progress tracking
                into one app-like workspace for serious learning.
              </Text>
              <View style={styles.landingActions}>
                <Pressable
                  style={({ pressed }) => [styles.heroButton, pressed && styles.pressedScale]}
                  onPress={onAuth}
                >
                  <Text style={styles.heroButtonText}>
                    {authMode === 'register' ? 'Create account' : 'Enter SkillSwap'}
                  </Text>
                </Pressable>
                <View style={styles.demoStrip}>
                  <Text style={styles.demoStripText}>demo@skillsswap.app · demo123</Text>
                </View>
              </View>
            </View>

            <View style={[styles.landingGlass, isPhone && styles.landingGlassPhone]}>
              <Text style={styles.glassTitle}>Live network snapshot</Text>
              <View style={[styles.glassGrid, isPhone && styles.glassGridPhone]}>
                {renderStatCard(
                  String(publicOverview?.totalMembers ?? 0),
                  'Members',
                  'Operators, specialists, and explorers'
                )}
                {renderStatCard(
                  String(publicOverview?.mentorCount ?? 0),
                  'Mentors',
                  'Curated experts with open slots'
                )}
                {renderStatCard(
                  String(publicOverview?.learnerCount ?? 0),
                  'Explorers',
                  'People actively seeking guidance'
                )}
                {renderStatCard(
                  String(publicOverview?.sessionCount ?? 0),
                  'Sessions',
                  'Already moving through the app'
                )}
              </View>
            </View>
          </View>
        </LinearGradient>

        <View style={[styles.landingGrid, isWide && styles.landingGridWide]}>
          <View style={[styles.landingMainColumn, isPhone && styles.landingMainColumnPhone]}>
            <View style={styles.surfaceCard}>
              <View style={styles.surfaceHeader}>
                <Text style={styles.surfaceTitle}>Featured mentors and explorers</Text>
                <Text style={styles.surfaceHint}>Real profiles served by the backend</Text>
              </View>
              <View style={[styles.memberGrid, isTablet && styles.memberGridTablet]}>
                {(publicOverview?.featuredCards ?? []).map((card) => renderMemberCard(card, true))}
              </View>
            </View>

            <View style={styles.surfaceCard}>
              <View style={styles.surfaceHeader}>
                <Text style={styles.surfaceTitle}>What the app includes</Text>
                <Text style={styles.surfaceHint}>Features are already wired, not mocked</Text>
              </View>
              <View style={styles.featureList}>
                <View style={styles.featureItem}>
                  <Text style={styles.featureTitle}>Discovery that feels curated</Text>
                  <Text style={styles.featureText}>Search by role, category, and skill with live availability and profile actions.</Text>
                </View>
                <View style={styles.featureItem}>
                  <Text style={styles.featureTitle}>Sessions with follow-through</Text>
                  <Text style={styles.featureText}>Book, update status, and export calendars without leaving the experience.</Text>
                </View>
                <View style={styles.featureItem}>
                  <Text style={styles.featureTitle}>Community loops</Text>
                  <Text style={styles.featureText}>Events, message threads, notifications, and progress all work together.</Text>
                </View>
              </View>
            </View>
          </View>

          <View style={[styles.landingSideColumn, isPhone && styles.landingSideColumnPhone]}>
            <View style={styles.authCard}>
              <Text style={styles.authCardTitle}>Join SkillSwap</Text>
              <Text style={styles.authCardText}>
                Sign in to access bookings, saved profiles, messages, events, and personal progress.
              </Text>
              <View style={styles.toggleRow}>
                <Pressable
                  style={({ pressed }) => [
                    styles.modeChip,
                    authMode === 'login' && styles.modeChipActive,
                    pressed && styles.pressedScale,
                  ]}
                  onPress={() => setAuthMode('login')}
                >
                  <Text
                    style={[
                      styles.modeChipText,
                      authMode === 'login' && styles.modeChipTextActive,
                    ]}
                  >
                    Login
                  </Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [
                    styles.modeChip,
                    authMode === 'register' && styles.modeChipActive,
                    pressed && styles.pressedScale,
                  ]}
                  onPress={() => setAuthMode('register')}
                >
                  <Text
                    style={[
                      styles.modeChipText,
                      authMode === 'register' && styles.modeChipTextActive,
                    ]}
                  >
                    Register
                  </Text>
                </Pressable>
              </View>
              {authMode === 'register' ? (
                <TextInput
                  style={styles.input}
                  value={authName}
                  onChangeText={setAuthName}
                  placeholder="Your name"
                  placeholderTextColor="#7a8a84"
                />
              ) : null}
              <TextInput
                style={styles.input}
                value={authEmail}
                onChangeText={setAuthEmail}
                placeholder="Email"
                placeholderTextColor="#7a8a84"
              />
              <TextInput
                style={styles.input}
                value={authPassword}
                onChangeText={setAuthPassword}
                placeholder="Password"
                placeholderTextColor="#7a8a84"
                secureTextEntry
              />
              <Pressable
                style={({ pressed }) => [styles.primaryWideButton, pressed && styles.pressedScale]}
                onPress={onAuth}
              >
                <Text style={styles.primaryWideButtonText}>
                  {authMode === 'register' ? 'Create account' : 'Continue'}
                </Text>
              </Pressable>
              {error ? <Text style={styles.error}>{error}</Text> : null}
            </View>

            <View style={styles.infoCard}>
              <Text style={styles.infoCardTitle}>Popular categories</Text>
              <View style={styles.tagWrap}>
                {(publicOverview?.categories ?? []).map((item) => (
                  <View key={item} style={styles.tag}>
                    <Text style={styles.tagText}>{item}</Text>
                  </View>
                ))}
              </View>
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
    )
  );

  const renderProfileCompletion = () => (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.landingScroll}>
        <LinearGradient colors={['#0d1c17', '#17392e']} style={styles.completionHero}>
          <Text style={styles.eyebrow}>MEMBER SETUP</Text>
          <Text style={styles.completionTitle}>Complete your profile before the network can route the right people to you.</Text>
          <Text style={styles.completionBody}>
            A stronger profile improves discovery, booking quality, and the recommendations shown in your dashboard.
          </Text>
        </LinearGradient>

        <View style={styles.formCard}>
          <TextInput
            style={styles.input}
            value={profileName}
            onChangeText={setProfileName}
            placeholder="Name"
            placeholderTextColor="#7a8a84"
          />
          <TextInput
            style={styles.input}
            value={profileHeadline}
            onChangeText={setProfileHeadline}
            placeholder="Headline"
            placeholderTextColor="#7a8a84"
          />
          <TextInput
            style={styles.input}
            value={profileCountry}
            onChangeText={setProfileCountry}
            placeholder="Country"
            placeholderTextColor="#7a8a84"
          />
          <TextInput
            style={[styles.input, styles.multilineInput]}
            value={profileBio}
            onChangeText={setProfileBio}
            placeholder="Describe what you do and how you help"
            placeholderTextColor="#7a8a84"
            multiline
          />
          <TextInput
            style={styles.input}
            value={profileOffered}
            onChangeText={setProfileOffered}
            placeholder="Skills you offer"
            placeholderTextColor="#7a8a84"
          />
          <TextInput
            style={styles.input}
            value={profileLearn}
            onChangeText={setProfileLearn}
            placeholder="Skills you want to learn"
            placeholderTextColor="#7a8a84"
          />
          <Pressable
            style={({ pressed }) => [styles.primaryWideButton, pressed && styles.pressedScale]}
            onPress={saveProfile}
          >
            <Text style={styles.primaryWideButtonText}>Save profile</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );

  const renderQuickActions = () => (
    <View style={[styles.quickActionRow, isPhone && styles.quickActionRowPhone]}>
      <Pressable
        style={({ pressed }) => [
          styles.quickAction,
          isPhone && styles.quickActionPhone,
          pressed && styles.pressedScale,
        ]}
        onPress={() => setActiveTab('Sessions')}
      >
        <Text style={styles.quickActionLabel}>Next session</Text>
        <Text style={styles.quickActionValue}>
          {upcomingSessions[0]?.time ?? 'Book one now'}
        </Text>
      </Pressable>
      <Pressable
        style={({ pressed }) => [
          styles.quickAction,
          isPhone && styles.quickActionPhone,
          pressed && styles.pressedScale,
        ]}
        onPress={() => setActiveTab('Community')}
      >
        <Text style={styles.quickActionLabel}>Unread conversations</Text>
        <Text style={styles.quickActionValue}>{messages.unreadCount} active</Text>
      </Pressable>
      <Pressable
        style={({ pressed }) => [
          styles.quickAction,
          isPhone && styles.quickActionPhone,
          pressed && styles.pressedScale,
        ]}
        onPress={() => setActiveTab('Progress')}
      >
        <Text style={styles.quickActionLabel}>Progress</Text>
        <Text style={styles.quickActionValue}>{completedCount}/3 milestones</Text>
      </Pressable>
    </View>
  );

  const renderPhoneSectionTitle = (title: string, hint?: string) => (
    <View style={styles.surfaceHeader}>
      <Text style={styles.surfaceTitle}>{title}</Text>
      {hint ? <Text style={styles.surfaceHint}>{hint}</Text> : null}
    </View>
  );

  const renderDashboard = () => (
    isPhone ? (
      <View style={styles.pageStack}>
        <View style={[styles.surfaceCard, styles.surfaceCardPhone]}>
          {renderPhoneSectionTitle('Today on SkillSwap', 'A clean mobile view of your network and next actions')}
          <View style={[styles.summaryRow, styles.summaryRowPhone]}>
            {renderStatCard(String(recommendedCards.length), 'Matches', 'Recommended now')}
            {renderStatCard(String(savedCards.length), 'Saved', 'Profiles in shortlist')}
          </View>
        </View>

        {renderQuickActions()}

        <View style={[styles.surfaceCard, styles.surfaceCardPhone]}>
          {renderPhoneSectionTitle('Discover people', 'Search, filter, and book from one place')}
          <TextInput
            style={styles.input}
            value={query}
            onChangeText={setQuery}
            placeholder="Search mentors, explorers, or skills"
            placeholderTextColor="#7a8a84"
          />
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.filterRow}>
              {categories.map((item) => (
                <Pressable
                  key={item}
                  style={({ pressed }) => [
                    styles.filterChip,
                    category === item && styles.filterChipActive,
                    pressed && styles.pressedScale,
                  ]}
                  onPress={() => setCategory(item)}
                >
                  <Text
                    style={[
                      styles.filterChipText,
                      category === item && styles.filterChipTextActive,
                    ]}
                  >
                    {item}
                  </Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.filterRow}>
              {personas.map((item) => (
                <Pressable
                  key={item}
                  style={({ pressed }) => [
                    styles.filterChip,
                    persona === item && styles.filterChipActive,
                    pressed && styles.pressedScale,
                  ]}
                  onPress={() => setPersona(item)}
                >
                  <Text
                    style={[
                      styles.filterChipText,
                      persona === item && styles.filterChipTextActive,
                    ]}
                  >
                    {personaLabel(item)}
                  </Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>
        </View>

        <View style={[styles.surfaceCard, styles.surfaceCardPhone]}>
          {renderPhoneSectionTitle('Recommended members', `${cards.length} live profiles match your filters`)}
        </View>

        {phoneRecommendedCards.map((card) => renderMobileMemberCard(card))}

        <View style={[styles.surfaceCard, styles.surfaceCardPhone]}>
          {renderPhoneSectionTitle('Saved shortlist')}
          {savedCards.slice(0, 5).map((card) => (
            <View key={card.id} style={styles.listRow}>
              <View>
                <Text style={styles.listRowTitle}>{card.name}</Text>
                <Text style={styles.listRowText}>{card.skill}</Text>
              </View>
              <Text style={styles.listRowMeta}>{card.country}</Text>
            </View>
          ))}
          {!savedCards.length ? (
            <Text style={styles.emptyText}>Save a few profiles to build your shortlist.</Text>
          ) : null}
        </View>

        <View style={[styles.surfaceCard, styles.surfaceCardPhone]}>
          {renderPhoneSectionTitle('Live opportunities', 'Join active community programs')}
          {events.slice(0, 4).map((event) => (
            <View key={event.id} style={styles.stackCard}>
              <Text style={styles.stackCardTitle}>{event.title}</Text>
              <Text style={styles.stackCardText}>{event.participants} attending</Text>
            </View>
          ))}
        </View>
      </View>
    ) : (
    <View style={styles.pageStack}>
      <LinearGradient
        colors={['#0d1d17', '#19372d', '#244d3f']}
        style={[styles.heroPanel, isPhone && styles.heroPanelPhone]}
      >
        <View style={[styles.heroPanelInner, isWide && styles.heroPanelInnerWide]}>
          <View style={styles.heroPanelCopy}>
            <Text style={styles.eyebrow}>{pageMeta.Discover.eyebrow}</Text>
            <Text style={[styles.pageHeroTitle, isPhone && styles.pageHeroTitlePhone]}>
              Welcome back, {user?.name.split(' ')[0]}. Your learning engine is ready.
            </Text>
            <Text style={styles.pageHeroBody}>
              Today’s view combines discovery, relationship signals, active sessions, and suggested next steps into one dashboard.
            </Text>
          </View>
          <View style={[styles.heroStats, isPhone && styles.heroStatsPhone]}>
            {renderStatCard(String(recommendedCards.length), 'Matches', 'Recommended now')}
            {renderStatCard(String(savedCards.length), 'Saved', 'Profiles in shortlist')}
            {renderStatCard(String(unreadNotifications), 'Alerts', 'Unread notifications')}
          </View>
        </View>
      </LinearGradient>

      {renderQuickActions()}

      <View style={[styles.contentColumns, isWide && styles.contentColumnsWide]}>
        <View style={[styles.primaryColumn, isPhone && styles.primaryColumnPhone]}>
          <View style={[styles.surfaceCard, isPhone && styles.surfaceCardPhone]}>
            <View style={styles.surfaceHeader}>
              <Text style={styles.surfaceTitle}>Discover your next best-fit people</Text>
              <Text style={styles.surfaceHint}>Search and filter the live network below</Text>
            </View>
            <TextInput
              style={styles.input}
              value={query}
              onChangeText={setQuery}
              placeholder="Search mentors, explorers, or skills"
              placeholderTextColor="#7a8a84"
            />
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.filterRow}>
                {categories.map((item) => (
                  <Pressable
                    key={item}
                    style={({ pressed }) => [
                      styles.filterChip,
                      category === item && styles.filterChipActive,
                      pressed && styles.pressedScale,
                    ]}
                    onPress={() => setCategory(item)}
                  >
                    <Text
                      style={[
                        styles.filterChipText,
                        category === item && styles.filterChipTextActive,
                      ]}
                    >
                      {item}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>
            <View style={styles.filterRow}>
              {personas.map((item) => (
                <Pressable
                  key={item}
                  style={({ pressed }) => [
                    styles.filterChip,
                    persona === item && styles.filterChipActive,
                    pressed && styles.pressedScale,
                  ]}
                  onPress={() => setPersona(item)}
                >
                  <Text
                    style={[
                      styles.filterChipText,
                      persona === item && styles.filterChipTextActive,
                    ]}
                  >
                    {personaLabel(item)}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          <View style={[styles.surfaceCard, isPhone && styles.surfaceCardPhone]}>
            <View style={styles.surfaceHeader}>
              <Text style={styles.surfaceTitle}>Recommended members</Text>
              <Text style={styles.surfaceHint}>{cards.length} live profiles currently match your filters</Text>
            </View>
            <View style={[styles.memberGrid, isTablet && styles.memberGridTablet]}>
              {recommendedCards.map((card) => renderMemberCard(card))}
            </View>
          </View>
        </View>

        <View style={[styles.secondaryColumn, isPhone && styles.secondaryColumnPhone]}>
          <View style={[styles.darkCard, isPhone && styles.darkCardPhone]}>
            <Text style={styles.darkCardTitle}>Network mix</Text>
            <Text style={styles.darkCardText}>
              {mentorCount} mentors and {learnerCount} explorers currently align with your filter state.
            </Text>
            <View style={styles.mixBar}>
              <View style={[styles.mixMentor, { flex: Math.max(mentorCount, 1) }]} />
              <View style={[styles.mixLearner, { flex: Math.max(learnerCount, 1) }]} />
            </View>
          </View>

          <View style={[styles.surfaceCard, isPhone && styles.surfaceCardPhone]}>
            <Text style={styles.surfaceTitle}>Saved shortlist</Text>
            {savedCards.slice(0, 3).map((card) => (
              <View key={card.id} style={styles.listRow}>
                <View>
                  <Text style={styles.listRowTitle}>{card.name}</Text>
                  <Text style={styles.listRowText}>{card.skill}</Text>
                </View>
                <Text style={styles.listRowMeta}>{card.country}</Text>
              </View>
            ))}
            {!savedCards.length ? (
              <Text style={styles.emptyText}>Save a few profiles to build your shortlist.</Text>
            ) : null}
          </View>

          <View style={[styles.surfaceCard, isPhone && styles.surfaceCardPhone]}>
            <Text style={styles.surfaceTitle}>Live opportunities</Text>
            {events.slice(0, 2).map((event) => (
              <View key={event.id} style={styles.stackCard}>
                <Text style={styles.stackCardTitle}>{event.title}</Text>
                <Text style={styles.stackCardText}>{event.participants} attending</Text>
              </View>
            ))}
          </View>
        </View>
      </View>
    </View>
    )
  );

  const renderSessions = () => (
    isPhone ? (
      <View style={styles.pageStack}>
        <View style={[styles.surfaceCard, styles.surfaceCardPhone]}>
          {renderPhoneSectionTitle('Session pipeline', 'Move from booked to live to completed')}
          <View style={[styles.summaryRow, styles.summaryRowPhone]}>
            {renderStatCard(String(upcomingSessions.length), 'Upcoming', 'Booked and ready')}
            {renderStatCard(String(liveSessions.length), 'Live', 'Currently active')}
            {renderStatCard(String(completedSessions.length), 'Done', 'Closed loop')}
          </View>
        </View>

        <View style={[styles.surfaceCard, styles.surfaceCardPhone]}>
          {renderPhoneSectionTitle('Upcoming and live')}
          {[...upcomingSessions, ...liveSessions].map((session) => (
            <View key={session.id} style={[styles.sessionCard, styles.sessionCardPhone]}>
              <View style={[styles.rowBetween, styles.rowBetweenPhone]}>
                <View>
                  <Text style={styles.sessionTitle}>{session.skill}</Text>
                  <Text style={styles.sessionMeta}>
                    With {session.with} · {session.time}
                  </Text>
                </View>
                <View
                  style={[
                    styles.sessionStatus,
                    session.status === 'live'
                      ? styles.sessionStatusLive
                      : styles.sessionStatusUpcoming,
                  ]}
                >
                  <Text style={styles.sessionStatusText}>{session.status.toUpperCase()}</Text>
                </View>
              </View>
              <View style={[styles.actionRow, styles.actionRowPhone]}>
                <Pressable
                  style={({ pressed }) => [styles.softButton, pressed && styles.pressedScale]}
                  onPress={() =>
                    api.updateSessionStatus(session.id, 'upcoming').then((updated) =>
                      setSessions((previous) =>
                        previous.map((item) => (item.id === session.id ? updated : item))
                      )
                    )
                  }
                >
                  <Text style={styles.softButtonText}>Upcoming</Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [styles.softButton, pressed && styles.pressedScale]}
                  onPress={() =>
                    api.updateSessionStatus(session.id, 'live').then((updated) =>
                      setSessions((previous) =>
                        previous.map((item) => (item.id === session.id ? updated : item))
                      )
                    )
                  }
                >
                  <Text style={styles.softButtonText}>Live</Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [styles.softButton, pressed && styles.pressedScale]}
                  onPress={() =>
                    api.updateSessionStatus(session.id, 'completed').then((updated) =>
                      setSessions((previous) =>
                        previous.map((item) => (item.id === session.id ? updated : item))
                      )
                    )
                  }
                >
                  <Text style={styles.softButtonText}>Complete</Text>
                </Pressable>
              </View>
            </View>
          ))}
          {!upcomingSessions.length && !liveSessions.length ? (
            <Text style={styles.emptyText}>Book a session from the dashboard to get started.</Text>
          ) : null}
        </View>

        <View style={[styles.surfaceCard, styles.surfaceCardPhone]}>
          {renderPhoneSectionTitle('Session archive')}
          {completedSessions.map((session) => (
            <View key={session.id} style={styles.listRow}>
              <View>
                <Text style={styles.listRowTitle}>{session.skill}</Text>
                <Text style={styles.listRowText}>{session.with}</Text>
              </View>
              <Text style={styles.listRowMeta}>{session.time}</Text>
            </View>
          ))}
          {!completedSessions.length ? (
            <Text style={styles.emptyText}>Completed sessions will collect here.</Text>
          ) : null}
        </View>
      </View>
    ) : (
    <View style={styles.pageStack}>
      <LinearGradient
        colors={['#0d1d17', '#17352b']}
        style={[styles.sectionHero, isPhone && styles.sectionHeroPhone]}
      >
        <Text style={styles.eyebrow}>{pageMeta.Sessions.eyebrow}</Text>
        <Text style={[styles.sectionHeroTitle, isPhone && styles.sectionHeroTitlePhone]}>
          Manage your booked conversations like a real scheduling workspace.
        </Text>
        <Text style={styles.sectionHeroText}>
          Upcoming sessions, live calls, completion states, and calendar exports all sit in one structured flow.
        </Text>
      </LinearGradient>

      <View style={[styles.summaryRow, isPhone && styles.summaryRowPhone]}>
        {renderStatCard(String(upcomingSessions.length), 'Upcoming', 'Booked and ready')}
        {renderStatCard(String(liveSessions.length), 'Live', 'Currently active')}
        {renderStatCard(String(completedSessions.length), 'Completed', 'Closed loop sessions')}
      </View>

      <View style={[styles.contentColumns, isWide && styles.contentColumnsWide]}>
        <View style={[styles.primaryColumn, isPhone && styles.primaryColumnPhone]}>
          <View style={[styles.surfaceCard, isPhone && styles.surfaceCardPhone]}>
            <Text style={styles.surfaceTitle}>Upcoming & live</Text>
            {[...upcomingSessions, ...liveSessions].map((session) => (
              <View key={session.id} style={[styles.sessionCard, isPhone && styles.sessionCardPhone]}>
                <View style={[styles.rowBetween, isPhone && styles.rowBetweenPhone]}>
                  <View>
                    <Text style={styles.sessionTitle}>{session.skill}</Text>
                    <Text style={styles.sessionMeta}>
                      With {session.with} · {session.time}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.sessionStatus,
                      session.status === 'live'
                        ? styles.sessionStatusLive
                        : styles.sessionStatusUpcoming,
                    ]}
                  >
                    <Text style={styles.sessionStatusText}>{session.status.toUpperCase()}</Text>
                  </View>
                </View>
                <View style={[styles.actionRow, isPhone && styles.actionRowPhone]}>
                  <Pressable
                    style={({ pressed }) => [styles.softButton, pressed && styles.pressedScale]}
                    onPress={() =>
                      api
                        .updateSessionStatus(session.id, 'upcoming')
                        .then((updated) =>
                          setSessions((previous) =>
                            previous.map((item) => (item.id === session.id ? updated : item))
                          )
                        )
                    }
                  >
                    <Text style={styles.softButtonText}>Upcoming</Text>
                  </Pressable>
                  <Pressable
                    style={({ pressed }) => [styles.softButton, pressed && styles.pressedScale]}
                    onPress={() =>
                      api
                        .updateSessionStatus(session.id, 'live')
                        .then((updated) =>
                          setSessions((previous) =>
                            previous.map((item) => (item.id === session.id ? updated : item))
                          )
                        )
                    }
                  >
                    <Text style={styles.softButtonText}>Live</Text>
                  </Pressable>
                  <Pressable
                    style={({ pressed }) => [styles.softButton, pressed && styles.pressedScale]}
                    onPress={() =>
                      api
                        .updateSessionStatus(session.id, 'completed')
                        .then((updated) =>
                          setSessions((previous) =>
                            previous.map((item) => (item.id === session.id ? updated : item))
                          )
                        )
                    }
                  >
                    <Text style={styles.softButtonText}>Complete</Text>
                  </Pressable>
                  <Pressable
                    style={({ pressed }) => [styles.ghostButton, pressed && styles.pressedScale]}
                    onPress={() =>
                      globalThis.open?.(
                        `${calendarBaseUrl}${session.calendarUrl}?token=${encodeURIComponent(
                          getAuthToken()
                        )}`,
                        '_blank'
                      )
                    }
                  >
                    <Text style={styles.ghostButtonText}>Calendar</Text>
                  </Pressable>
                </View>
              </View>
            ))}
            {!upcomingSessions.length && !liveSessions.length ? (
              <Text style={styles.emptyText}>Book a session from the dashboard to get started.</Text>
            ) : null}
          </View>
        </View>

        <View style={[styles.secondaryColumn, isPhone && styles.secondaryColumnPhone]}>
          <View style={[styles.surfaceCard, isPhone && styles.surfaceCardPhone]}>
            <Text style={styles.surfaceTitle}>Session archive</Text>
            {completedSessions.map((session) => (
              <View key={session.id} style={styles.listRow}>
                <View>
                  <Text style={styles.listRowTitle}>{session.skill}</Text>
                  <Text style={styles.listRowText}>{session.with}</Text>
                </View>
                <Text style={styles.listRowMeta}>{session.time}</Text>
              </View>
            ))}
            {!completedSessions.length ? (
              <Text style={styles.emptyText}>Completed sessions will collect here.</Text>
            ) : null}
          </View>

          <View style={[styles.darkCard, isPhone && styles.darkCardPhone]}>
            <Text style={styles.darkCardTitle}>Operator note</Text>
            <Text style={styles.darkCardText}>
              Move sessions to live when they start, then complete them afterward to keep your activity feed and progress accurate.
            </Text>
          </View>
        </View>
      </View>
    </View>
    )
  );

  const renderCommunity = () => (
    isPhone ? (
      <View style={styles.pageStack}>
        <View style={[styles.surfaceCard, styles.surfaceCardPhone]}>
          {renderPhoneSectionTitle('Community events', 'Join curated rooms and small-group sessions')}
          {events.map((event) => (
            <View key={event.id} style={[styles.eventCard, styles.eventCardPhone]}>
              <View style={[styles.rowBetween, styles.rowBetweenPhone]}>
                <View style={styles.eventCopy}>
                  <Text style={styles.eventTitle}>{event.title}</Text>
                  <Text style={styles.eventText}>{event.description}</Text>
                </View>
                <Text style={styles.eventMeta}>{event.participants}</Text>
              </View>
              <Pressable
                style={({ pressed }) => [styles.primaryButton, pressed && styles.pressedScale]}
                onPress={() =>
                  api.joinEvent(event.id).then((updated) =>
                    setEvents((previous) =>
                      previous.map((item) => (item.id === event.id ? updated : item))
                    )
                  )
                }
              >
                <Text style={styles.primaryButtonText}>{event.joined ? 'Joined' : 'Join room'}</Text>
              </Pressable>
            </View>
          ))}
        </View>

        <View style={[styles.surfaceCard, styles.surfaceCardPhone]}>
          <View style={[styles.rowBetween, styles.rowBetweenPhone]}>
            <Text style={styles.surfaceTitle}>Notifications</Text>
            <Pressable
              style={({ pressed }) => [styles.softButton, pressed && styles.pressedScale]}
              onPress={() => api.markNotificationsRead().then(setNotifications)}
            >
              <Text style={styles.softButtonText}>Mark read</Text>
            </Pressable>
          </View>
          {notifications.slice(0, 5).map((notification) => (
            <View key={notification.id} style={styles.notificationItem}>
              <View style={styles.notificationDot} />
              <View style={styles.notificationBody}>
                <Text style={styles.notificationTitle}>{notification.title}</Text>
                <Text style={styles.notificationText}>{notification.detail}</Text>
              </View>
            </View>
          ))}
        </View>

        <View style={[styles.surfaceCard, styles.surfaceCardPhone]}>
          {renderPhoneSectionTitle('Message threads')}
          {threads.map((thread) => (
            <View key={thread.id} style={[styles.threadCard, styles.threadCardPhone]}>
              <View style={[styles.rowBetween, styles.rowBetweenPhone]}>
                <Text style={styles.threadName}>{thread.participant}</Text>
                <Text style={styles.threadUnread}>{thread.unread} unread</Text>
              </View>
              <Text style={styles.threadTopic}>{thread.topic}</Text>
              <Text style={styles.threadText}>{thread.lastMessage}</Text>
              <TextInput
                style={styles.input}
                value={drafts[thread.id] ?? ''}
                onChangeText={(value) =>
                  setDrafts((previous) => ({ ...previous, [thread.id]: value }))
                }
                placeholder="Reply"
                placeholderTextColor="#7a8a84"
              />
              <Pressable
                style={({ pressed }) => [styles.primaryButton, pressed && styles.pressedScale]}
                onPress={() => {
                  const text = (drafts[thread.id] ?? '').trim();
                  if (!text) return;
                  api.replyThread(thread.id, text).then((updated) => {
                    setThreads((previous) =>
                      previous.map((item) => (item.id === thread.id ? updated : item))
                    );
                  });
                  setDrafts((previous) => ({ ...previous, [thread.id]: '' }));
                }}
              >
                <Text style={styles.primaryButtonText}>Send reply</Text>
              </Pressable>
            </View>
          ))}
        </View>
      </View>
    ) : (
    <View style={styles.pageStack}>
      <LinearGradient
        colors={['#0d1d17', '#17352b']}
        style={[styles.sectionHero, isPhone && styles.sectionHeroPhone]}
      >
        <Text style={styles.eyebrow}>{pageMeta.Community.eyebrow}</Text>
        <Text style={[styles.sectionHeroTitle, isPhone && styles.sectionHeroTitlePhone]}>
          Your events, inbox, and signals now live in one real communication layer.
        </Text>
        <Text style={styles.sectionHeroText}>
          Instead of generic cards, this section behaves like a proper community workspace.
        </Text>
      </LinearGradient>

      <View style={[styles.contentColumns, isWide && styles.contentColumnsWide]}>
        <View style={[styles.primaryColumn, isPhone && styles.primaryColumnPhone]}>
          <View style={[styles.surfaceCard, isPhone && styles.surfaceCardPhone]}>
            <View style={styles.surfaceHeader}>
              <Text style={styles.surfaceTitle}>Community events</Text>
              <Text style={styles.surfaceHint}>Join curated rooms and small-group sessions</Text>
            </View>
            {events.map((event) => (
              <View key={event.id} style={[styles.eventCard, isPhone && styles.eventCardPhone]}>
                <View style={[styles.rowBetween, isPhone && styles.rowBetweenPhone]}>
                  <View style={styles.eventCopy}>
                    <Text style={styles.eventTitle}>{event.title}</Text>
                    <Text style={styles.eventText}>{event.description}</Text>
                  </View>
                  <Text style={styles.eventMeta}>{event.participants}</Text>
                </View>
                <Pressable
                  style={({ pressed }) => [styles.primaryButton, pressed && styles.pressedScale]}
                  onPress={() =>
                    api
                      .joinEvent(event.id)
                      .then((updated) =>
                        setEvents((previous) =>
                          previous.map((item) => (item.id === event.id ? updated : item))
                        )
                      )
                  }
                >
                  <Text style={styles.primaryButtonText}>
                    {event.joined ? 'Joined' : 'Join room'}
                  </Text>
                </Pressable>
              </View>
            ))}
          </View>
        </View>

        <View style={[styles.secondaryColumn, isPhone && styles.secondaryColumnPhone]}>
          <View style={[styles.surfaceCard, isPhone && styles.surfaceCardPhone]}>
            <View style={[styles.rowBetween, isPhone && styles.rowBetweenPhone]}>
              <Text style={styles.surfaceTitle}>Notifications</Text>
              <Pressable
                style={({ pressed }) => [styles.softButton, pressed && styles.pressedScale]}
                onPress={() => api.markNotificationsRead().then(setNotifications)}
              >
                <Text style={styles.softButtonText}>Mark read</Text>
              </Pressable>
            </View>
            {notifications.slice(0, 5).map((notification) => (
              <View key={notification.id} style={styles.notificationItem}>
                <View style={styles.notificationDot} />
                <View style={styles.notificationBody}>
                  <Text style={styles.notificationTitle}>{notification.title}</Text>
                  <Text style={styles.notificationText}>{notification.detail}</Text>
                </View>
              </View>
            ))}
          </View>

          <View style={[styles.surfaceCard, isPhone && styles.surfaceCardPhone]}>
            <Text style={styles.surfaceTitle}>Message threads</Text>
            {threads.map((thread) => (
              <View key={thread.id} style={[styles.threadCard, isPhone && styles.threadCardPhone]}>
                <View style={[styles.rowBetween, isPhone && styles.rowBetweenPhone]}>
                  <Text style={styles.threadName}>{thread.participant}</Text>
                  <Text style={styles.threadUnread}>{thread.unread} unread</Text>
                </View>
                <Text style={styles.threadTopic}>{thread.topic}</Text>
                <Text style={styles.threadText}>{thread.lastMessage}</Text>
                <TextInput
                  style={styles.input}
                  value={drafts[thread.id] ?? ''}
                  onChangeText={(value) =>
                    setDrafts((previous) => ({ ...previous, [thread.id]: value }))
                  }
                  placeholder="Reply"
                  placeholderTextColor="#7a8a84"
                />
                <Pressable
                  style={({ pressed }) => [styles.primaryButton, pressed && styles.pressedScale]}
                  onPress={() => {
                    const text = (drafts[thread.id] ?? '').trim();
                    if (!text) return;
                    api.replyThread(thread.id, text).then((updated) => {
                      setThreads((previous) =>
                        previous.map((item) => (item.id === thread.id ? updated : item))
                      );
                    });
                    setDrafts((previous) => ({ ...previous, [thread.id]: '' }));
                  }}
                >
                  <Text style={styles.primaryButtonText}>Send reply</Text>
                </Pressable>
              </View>
            ))}
          </View>
        </View>
      </View>
    </View>
    )
  );

  const renderProgress = () => (
    isPhone ? (
      <View style={styles.pageStack}>
        <View style={[styles.surfaceCard, styles.surfaceCardPhone]}>
          {renderPhoneSectionTitle('Progress overview', 'Your current momentum at a glance')}
          <View style={[styles.summaryRow, styles.summaryRowPhone]}>
            {renderStatCard(String(completedCount), 'Milestones', 'Out of 3')}
            {renderStatCard(
              `${plan?.skillsCompleted ?? 0}/${plan?.skillsTarget ?? 0}`,
              'Skills',
              'Completion ratio'
            )}
          </View>
        </View>

        <View style={[styles.surfaceCard, styles.surfaceCardPhone]}>
          {renderPhoneSectionTitle('Roadmap')}
          <View style={styles.roadmapTrack}>
            <View
              style={[
                styles.roadmapFill,
                {
                  width: `${((plan?.skillsCompleted ?? 0) / Math.max(plan?.skillsTarget ?? 1, 1)) * 100}%`,
                },
              ]}
            />
          </View>
          <View style={styles.roadmapItem}>
            <Text style={styles.roadmapTitle}>Profile completed</Text>
            <Text style={styles.roadmapState}>{plan?.profileCompleted ? 'Done' : 'Pending'}</Text>
          </View>
          <View style={styles.roadmapItem}>
            <Text style={styles.roadmapTitle}>First session booked</Text>
            <Text style={styles.roadmapState}>{plan?.firstSessionBooked ? 'Done' : 'Pending'}</Text>
          </View>
          <View style={styles.roadmapItem}>
            <Text style={styles.roadmapTitle}>Challenge joined</Text>
            <Text style={styles.roadmapState}>{plan?.challengeJoined ? 'Done' : 'Pending'}</Text>
          </View>
        </View>

        <View style={[styles.surfaceCard, styles.surfaceCardPhone]}>
          {renderPhoneSectionTitle('Signals helping progress')}
          <View style={styles.listRow}>
            <Text style={styles.listRowTitle}>Saved profiles</Text>
            <Text style={styles.listRowMeta}>{savedCards.length}</Text>
          </View>
          <View style={styles.listRow}>
            <Text style={styles.listRowTitle}>Upcoming sessions</Text>
            <Text style={styles.listRowMeta}>{upcomingSessions.length}</Text>
          </View>
          <View style={styles.listRow}>
            <Text style={styles.listRowTitle}>Joined events</Text>
            <Text style={styles.listRowMeta}>{events.filter((item) => item.joined).length}</Text>
          </View>
        </View>
      </View>
    ) : (
    <View style={styles.pageStack}>
      <LinearGradient
        colors={['#0d1d17', '#17352b']}
        style={[styles.sectionHero, isPhone && styles.sectionHeroPhone]}
      >
        <Text style={styles.eyebrow}>{pageMeta.Progress.eyebrow}</Text>
        <Text style={[styles.sectionHeroTitle, isPhone && styles.sectionHeroTitlePhone]}>
          Treat progress like an operating system, not a checklist.
        </Text>
        <Text style={styles.sectionHeroText}>
          This view keeps the goal structure clear: finish setup, book momentum, and deepen community participation.
        </Text>
      </LinearGradient>

      <View style={[styles.summaryRow, isPhone && styles.summaryRowPhone]}>
        {renderStatCard(String(completedCount), 'Milestones', 'Out of the current 3')}
        {renderStatCard(
          `${plan?.skillsCompleted ?? 0}/${plan?.skillsTarget ?? 0}`,
          'Skills target',
          'Current completion ratio'
        )}
        {renderStatCard(String(connectedCards.length), 'Connections', 'People already engaged')}
      </View>

      <View style={[styles.contentColumns, isWide && styles.contentColumnsWide]}>
        <View style={[styles.primaryColumn, isPhone && styles.primaryColumnPhone]}>
          <View style={[styles.surfaceCard, isPhone && styles.surfaceCardPhone]}>
            <Text style={styles.surfaceTitle}>Roadmap</Text>
            <View style={styles.roadmapTrack}>
              <View
                style={[
                  styles.roadmapFill,
                  {
                    width: `${((plan?.skillsCompleted ?? 0) / Math.max(plan?.skillsTarget ?? 1, 1)) * 100}%`,
                  },
                ]}
              />
            </View>
            <View style={styles.roadmapItem}>
              <Text style={styles.roadmapTitle}>Profile completed</Text>
              <Text style={styles.roadmapState}>
                {plan?.profileCompleted ? 'Done' : 'Pending'}
              </Text>
            </View>
            <View style={styles.roadmapItem}>
              <Text style={styles.roadmapTitle}>First session booked</Text>
              <Text style={styles.roadmapState}>
                {plan?.firstSessionBooked ? 'Done' : 'Pending'}
              </Text>
            </View>
            <View style={styles.roadmapItem}>
              <Text style={styles.roadmapTitle}>Challenge joined</Text>
              <Text style={styles.roadmapState}>
                {plan?.challengeJoined ? 'Done' : 'Pending'}
              </Text>
            </View>
          </View>
        </View>

        <View style={[styles.secondaryColumn, isPhone && styles.secondaryColumnPhone]}>
          <View style={[styles.darkCard, isPhone && styles.darkCardPhone]}>
            <Text style={styles.darkCardTitle}>Next best move</Text>
            <Text style={styles.darkCardText}>
              Book one session in a new category and reply to one active thread to make this growth loop feel materially stronger.
            </Text>
          </View>
          <View style={[styles.surfaceCard, isPhone && styles.surfaceCardPhone]}>
            <Text style={styles.surfaceTitle}>Signals helping progress</Text>
            <View style={styles.listRow}>
              <Text style={styles.listRowTitle}>Saved profiles</Text>
              <Text style={styles.listRowMeta}>{savedCards.length}</Text>
            </View>
            <View style={styles.listRow}>
              <Text style={styles.listRowTitle}>Upcoming sessions</Text>
              <Text style={styles.listRowMeta}>{upcomingSessions.length}</Text>
            </View>
            <View style={styles.listRow}>
              <Text style={styles.listRowTitle}>Joined events</Text>
              <Text style={styles.listRowMeta}>{events.filter((item) => item.joined).length}</Text>
            </View>
          </View>
        </View>
      </View>
    </View>
    )
  );

  const renderProfile = () => (
    isPhone ? (
      <View style={styles.pageStack}>
        <View style={[styles.surfaceCard, styles.surfaceCardPhone]}>
          {renderPhoneSectionTitle('Profile')}
          <Text style={styles.surfaceTitle}>{user?.name}</Text>
          <Text style={styles.profileHeadline}>{user?.headline}</Text>
          <Text style={styles.profileSubline}>
            {user?.country} · {user?.email}
          </Text>
          <Text style={styles.profileBio}>{user?.bio}</Text>
        </View>

        <View style={[styles.surfaceCard, styles.surfaceCardPhone]}>
          {renderPhoneSectionTitle('Skills offered')}
          <View style={styles.tagWrap}>
            {user?.skillsOffered.map((item) => (
              <View key={item} style={styles.tag}>
                <Text style={styles.tagText}>{item}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={[styles.surfaceCard, styles.surfaceCardPhone]}>
          {renderPhoneSectionTitle('Learning next')}
          <View style={styles.tagWrap}>
            {user?.skillsToLearn.map((item) => (
              <View key={item} style={styles.tag}>
                <Text style={styles.tagText}>{item}</Text>
              </View>
            ))}
          </View>
        </View>

        <Pressable
          style={({ pressed }) => [styles.primaryWideButton, pressed && styles.pressedScale]}
          onPress={() => setProfileModal(true)}
        >
          <Text style={styles.primaryWideButtonText}>Edit profile</Text>
        </Pressable>
      </View>
    ) : (
    <View style={styles.pageStack}>
      <LinearGradient
        colors={['#0d1d17', '#17352b']}
        style={[styles.sectionHero, isPhone && styles.sectionHeroPhone]}
      >
        <Text style={styles.eyebrow}>{pageMeta.Profile.eyebrow}</Text>
        <Text style={[styles.sectionHeroTitle, isPhone && styles.sectionHeroTitlePhone]}>
          Your member profile is now treated like the center of the product.
        </Text>
        <Text style={styles.sectionHeroText}>
          Identity, offering, and learning intent are organized as a proper profile surface instead of scattered fields.
        </Text>
      </LinearGradient>

      <View style={[styles.contentColumns, isWide && styles.contentColumnsWide]}>
        <View style={[styles.primaryColumn, isPhone && styles.primaryColumnPhone]}>
          <View style={[styles.surfaceCard, isPhone && styles.surfaceCardPhone]}>
            <Text style={styles.surfaceTitle}>{user?.name}</Text>
            <Text style={styles.profileHeadline}>{user?.headline}</Text>
            <Text style={styles.profileSubline}>
              {user?.country} · {user?.email}
            </Text>
            <Text style={styles.profileBio}>{user?.bio}</Text>
          </View>
        </View>

        <View style={[styles.secondaryColumn, isPhone && styles.secondaryColumnPhone]}>
          <View style={[styles.surfaceCard, isPhone && styles.surfaceCardPhone]}>
            <Text style={styles.surfaceTitle}>Skills offered</Text>
            <View style={styles.tagWrap}>
              {user?.skillsOffered.map((item) => (
                <View key={item} style={styles.tag}>
                  <Text style={styles.tagText}>{item}</Text>
                </View>
              ))}
            </View>
          </View>

          <View style={[styles.surfaceCard, isPhone && styles.surfaceCardPhone]}>
            <Text style={styles.surfaceTitle}>Learning next</Text>
            <View style={styles.tagWrap}>
              {user?.skillsToLearn.map((item) => (
                <View key={item} style={styles.tag}>
                  <Text style={styles.tagText}>{item}</Text>
                </View>
              ))}
            </View>
          </View>

          <Pressable
            style={({ pressed }) => [styles.primaryWideButton, pressed && styles.pressedScale]}
            onPress={() => setProfileModal(true)}
          >
            <Text style={styles.primaryWideButtonText}>Edit profile</Text>
          </Pressable>
        </View>
      </View>
    </View>
    )
  );

  const renderActivePage = () => {
    if (activeTab === 'Discover') return renderDashboard();
    if (activeTab === 'Sessions') return renderSessions();
    if (activeTab === 'Community') return renderCommunity();
    if (activeTab === 'Progress') return renderProgress();
    return renderProfile();
  };

  const renderSidebar = () => (
    <View style={styles.sidebar}>
      <Text style={styles.sidebarBrand}>SkillSwap</Text>
      <Text style={styles.sidebarBrandSub}>Private exchange</Text>
      <View style={styles.sidebarNav}>
        {tabs.map((tab) => (
          <Pressable
            key={tab}
            style={({ pressed }) => [
              styles.sidebarItem,
              activeTab === tab && styles.sidebarItemActive,
              pressed && styles.pressedScale,
            ]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[styles.sidebarItemIcon, activeTab === tab && styles.sidebarItemIconActive]}>
              {iconForTab(tab)}
            </Text>
            <Text style={[styles.sidebarItemText, activeTab === tab && styles.sidebarItemTextActive]}>
              {pageMeta[tab].label}
            </Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.sidebarFooter}>
        <Text style={styles.sidebarFooterTitle}>{user?.name}</Text>
        <Text style={styles.sidebarFooterText}>{user?.headline}</Text>
      </View>
    </View>
  );

  const renderMobileDock = () => (
    <View style={[styles.bottomDock, isPhone ? styles.bottomDockPhoneInline : styles.bottomDockTablet]}>
      {tabs.map((tab) => (
        <Pressable
          key={tab}
          style={({ pressed }) => [
            styles.dockItem,
            isPhone && styles.dockItemPhone,
            activeTab === tab && styles.dockItemActive,
            pressed && styles.pressedScale,
          ]}
          onPress={() => setActiveTab(tab)}
        >
          <Text
            style={[
              styles.dockText,
              isPhone && styles.dockTextPhone,
              activeTab === tab && styles.dockTextActive,
            ]}
          >
            {mobileTabLabel[tab]}
          </Text>
        </Pressable>
      ))}
    </View>
  );

  if (booting) {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar style="light" />
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#d8f2e5" />
        </View>
      </SafeAreaView>
    );
  }

  if (!token || !user) {
    return renderLanding();
  }

  if (!completeProfile(user)) {
    return renderProfileCompletion();
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="light" />
      <View style={styles.appBackground}>
        <View style={styles.glowOne} />
        <View style={styles.glowTwo} />
      </View>

      <View style={[styles.appShell, isWide && styles.appShellWide]}>
        {isWide ? renderSidebar() : null}

        <View style={styles.mainShell}>
          <View style={[styles.topBar, isPhone && styles.topBarPhone]}>
            <View style={isPhone ? styles.topBarCopyPhone : undefined}>
              <Text style={styles.topBarEyebrow}>{pageMeta[activeTab].eyebrow}</Text>
              <Text style={[styles.topBarTitle, isPhone && styles.topBarTitlePhone]}>
                {pageMeta[activeTab].label}
              </Text>
            </View>
            <View style={[styles.topBarActions, isPhone && styles.topBarActionsPhone]}>
              <Pressable
                style={({ pressed }) => [styles.softButton, pressed && styles.pressedScale]}
                onPress={() => api.markMessagesRead().then(setMessages)}
              >
                <Text style={styles.softButtonText}>Inbox {messages.unreadCount}</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.ghostButtonDark, pressed && styles.pressedScale]}
                onPress={onLogout}
              >
                <Text style={styles.ghostButtonDarkText}>Logout</Text>
              </Pressable>
            </View>
          </View>

          {loading ? (
            <View style={styles.center}>
              <ActivityIndicator size="large" color="#d8f2e5" />
            </View>
          ) : (
            <Animated.ScrollView
              contentContainerStyle={[styles.appScroll, isPhone && styles.appScrollPhone]}
              style={{ opacity: contentOpacity, transform: [{ translateY: contentLift }] }}
            >
              {renderActivePage()}
            </Animated.ScrollView>
          )}

          {!isWide ? renderMobileDock() : null}
        </View>
      </View>

      <Modal
        transparent
        visible={Boolean(bookingCard)}
        animationType="slide"
        onRequestClose={() => setBookingCard(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.surfaceTitle}>Book session with {bookingCard?.name}</Text>
            <Text style={styles.surfaceHint}>Choose the next available slot</Text>
            <View style={[styles.slotRow, isPhone && styles.slotRowPhone]}>
              {bookingCard?.nextSessionSlots.map((nextSlot) => (
                <Pressable
                  key={nextSlot}
                  style={({ pressed }) => [
                    styles.slotChip,
                    slot === nextSlot && styles.slotChipActive,
                    pressed && styles.pressedScale,
                  ]}
                  onPress={() => setSlot(nextSlot)}
                >
                  <Text
                    style={[
                      styles.slotChipText,
                      slot === nextSlot && styles.slotChipTextActive,
                    ]}
                  >
                    {nextSlot}
                  </Text>
                </Pressable>
              ))}
            </View>
            <View style={[styles.actionRow, isPhone && styles.actionRowPhone]}>
              <Pressable
                style={({ pressed }) => [styles.softButton, pressed && styles.pressedScale]}
                onPress={() => setBookingCard(null)}
              >
                <Text style={styles.softButtonText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.primaryButton, pressed && styles.pressedScale]}
                onPress={() => {
                  if (!bookingCard || !slot) return;
                  api.bookSession(bookingCard.id, slot).then((session) => {
                    setSessions((previous) => [session, ...previous]);
                    setBookingCard(null);
                    setActiveTab('Sessions');
                  });
                }}
              >
                <Text style={styles.primaryButtonText}>Confirm booking</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        transparent
        visible={profileModal}
        animationType="slide"
        onRequestClose={() => setProfileModal(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.surfaceTitle}>Edit profile</Text>
            <TextInput
              style={styles.input}
              value={profileName}
              onChangeText={setProfileName}
              placeholder="Name"
              placeholderTextColor="#7a8a84"
            />
            <TextInput
              style={styles.input}
              value={profileHeadline}
              onChangeText={setProfileHeadline}
              placeholder="Headline"
              placeholderTextColor="#7a8a84"
            />
            <TextInput
              style={styles.input}
              value={profileCountry}
              onChangeText={setProfileCountry}
              placeholder="Country"
              placeholderTextColor="#7a8a84"
            />
            <TextInput
              style={[styles.input, styles.multilineInput]}
              value={profileBio}
              onChangeText={setProfileBio}
              placeholder="Bio"
              placeholderTextColor="#7a8a84"
              multiline
            />
            <TextInput
              style={styles.input}
              value={profileOffered}
              onChangeText={setProfileOffered}
              placeholder="Skills offered"
              placeholderTextColor="#7a8a84"
            />
            <TextInput
              style={styles.input}
              value={profileLearn}
              onChangeText={setProfileLearn}
              placeholder="Skills to learn"
              placeholderTextColor="#7a8a84"
            />
            <View style={[styles.actionRow, isPhone && styles.actionRowPhone]}>
              <Pressable
                style={({ pressed }) => [styles.softButton, pressed && styles.pressedScale]}
                onPress={() => setProfileModal(false)}
              >
                <Text style={styles.softButtonText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.primaryButton, pressed && styles.pressedScale]}
                onPress={saveProfile}
              >
                <Text style={styles.primaryButtonText}>Save changes</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#08120f',
  },
  appBackground: {
    ...StyleSheet.absoluteFillObject,
  },
  glowOne: {
    position: 'absolute',
    top: -120,
    left: -80,
    width: 320,
    height: 320,
    borderRadius: 999,
    backgroundColor: 'rgba(41, 97, 77, 0.32)',
  },
  glowTwo: {
    position: 'absolute',
    right: -120,
    top: 160,
    width: 340,
    height: 340,
    borderRadius: 999,
    backgroundColor: 'rgba(201, 154, 85, 0.16)',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  appShell: {
    flex: 1,
  },
  appShellWide: {
    flexDirection: 'row',
  },
  sidebar: {
    width: 220,
    paddingTop: 28,
    paddingHorizontal: 18,
    paddingBottom: 22,
    borderRightWidth: 1,
    borderRightColor: 'rgba(255,255,255,0.06)',
    backgroundColor: 'rgba(7, 18, 15, 0.82)',
    gap: 18,
  },
  sidebarBrand: {
    color: '#f4fbf7',
    fontSize: 28,
    fontWeight: '900',
  },
  sidebarBrandSub: {
    color: '#94b7a8',
    fontSize: 13,
    fontWeight: '600',
    marginTop: -10,
  },
  sidebarNav: {
    gap: 10,
    marginTop: 12,
  },
  sidebarItem: {
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 14,
    backgroundColor: 'rgba(255,255,255,0.03)',
    gap: 6,
  },
  sidebarItemActive: {
    backgroundColor: '#f0c57c',
  },
  sidebarItemIcon: {
    color: '#aac9bc',
    fontSize: 12,
    fontWeight: '700',
  },
  sidebarItemIconActive: {
    color: '#18211d',
  },
  sidebarItemText: {
    color: '#eff7f3',
    fontSize: 15,
    fontWeight: '800',
  },
  sidebarItemTextActive: {
    color: '#18211d',
  },
  sidebarFooter: {
    marginTop: 'auto',
    padding: 14,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.04)',
    gap: 4,
  },
  sidebarFooterTitle: {
    color: '#f3faf6',
    fontSize: 14,
    fontWeight: '800',
  },
  sidebarFooterText: {
    color: '#96b7aa',
    fontSize: 12,
    lineHeight: 18,
  },
  mainShell: {
    flex: 1,
  },
  topBar: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  topBarPhone: {
    alignItems: 'flex-start',
    flexDirection: 'column',
    paddingTop: 12,
    paddingBottom: 8,
  },
  topBarCopyPhone: {
    width: '100%',
  },
  topBarEyebrow: {
    color: '#9cbcae',
    fontSize: 11,
    letterSpacing: 1.5,
    fontWeight: '700',
  },
  topBarTitle: {
    color: '#f5fbf8',
    fontSize: 28,
    fontWeight: '900',
  },
  topBarTitlePhone: {
    fontSize: 24,
  },
  topBarActions: {
    flexDirection: 'row',
    gap: 10,
    flexWrap: 'wrap',
  },
  topBarActionsPhone: {
    width: '100%',
    gap: 8,
  },
  appScroll: {
    paddingHorizontal: 20,
    paddingBottom: 24,
    gap: 18,
  },
  appScrollPhone: {
    paddingHorizontal: 14,
    gap: 14,
    paddingTop: 6,
    paddingBottom: 18,
  },
  pageStack: {
    gap: 18,
  },
  landingScroll: {
    padding: 22,
    gap: 18,
    paddingBottom: 54,
  },
  landingScrollPhone: {
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 24,
  },
  eyebrow: {
    color: '#b7d5c7',
    fontSize: 11,
    letterSpacing: 1.6,
    fontWeight: '700',
  },
  landingHero: {
    borderRadius: 34,
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  landingHeroPhone: {
    borderRadius: 26,
    padding: 18,
  },
  landingHeroInner: {
    gap: 18,
  },
  landingHeroInnerWide: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  landingCopy: {
    flex: 1.1,
    gap: 14,
  },
  landingCopyPhone: {
    flex: 0,
  },
  landingTitle: {
    color: '#fbfcfb',
    fontSize: 36,
    lineHeight: 42,
    fontWeight: '900',
    maxWidth: 660,
  },
  landingTitlePhone: {
    fontSize: 28,
    lineHeight: 34,
  },
  landingBody: {
    color: '#c7ddd3',
    fontSize: 15,
    lineHeight: 24,
    maxWidth: 620,
  },
  landingActions: {
    gap: 12,
    marginTop: 8,
  },
  heroButton: {
    alignSelf: 'flex-start',
    backgroundColor: '#f1c57d',
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  heroButtonText: {
    color: '#1b221e',
    fontSize: 14,
    fontWeight: '800',
  },
  demoStrip: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  demoStripText: {
    color: '#eef7f2',
    fontSize: 13,
    fontWeight: '700',
  },
  landingGlass: {
    flex: 0.9,
    borderRadius: 28,
    padding: 18,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    gap: 14,
  },
  landingGlassPhone: {
    flex: 0,
    width: '100%',
  },
  glassTitle: {
    color: '#f4fbf7',
    fontSize: 18,
    fontWeight: '900',
  },
  glassGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  glassGridPhone: {
    flexDirection: 'column',
    alignItems: 'stretch',
  },
  statCard: {
    flexGrow: 1,
    minWidth: 130,
    borderRadius: 22,
    padding: 16,
    backgroundColor: '#183c31',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    gap: 4,
  },
  statCardPhone: {
    minWidth: 0,
    width: '100%',
    flexGrow: 0,
    flexBasis: 'auto',
    alignSelf: 'stretch',
  },
  statValue: {
    color: '#ffffff',
    fontSize: 26,
    fontWeight: '900',
  },
  statLabel: {
    color: '#d7ebe2',
    fontSize: 12,
    fontWeight: '700',
  },
  statDetail: {
    color: '#acc9bb',
    fontSize: 12,
    lineHeight: 18,
  },
  landingGrid: {
    gap: 18,
  },
  landingGridWide: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  landingMainColumn: {
    flex: 1.2,
    gap: 18,
  },
  landingMainColumnPhone: {
    flex: 0,
  },
  landingSideColumn: {
    flex: 0.8,
    gap: 18,
  },
  landingSideColumnPhone: {
    flex: 0,
  },
  surfaceCard: {
    backgroundColor: '#f7f4ee',
    borderRadius: 30,
    padding: 20,
    borderWidth: 1,
    borderColor: '#ded4c4',
    gap: 16,
  },
  surfaceCardPhone: {
    padding: 18,
    borderRadius: 26,
  },
  surfaceHeader: {
    gap: 4,
  },
  surfaceTitle: {
    color: '#17211d',
    fontSize: 22,
    fontWeight: '900',
  },
  surfaceHint: {
    color: '#61756d',
    fontSize: 13,
    lineHeight: 19,
  },
  featureList: {
    gap: 14,
  },
  featureItem: {
    gap: 4,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e8dfcf',
  },
  featureTitle: {
    color: '#17211d',
    fontSize: 15,
    fontWeight: '800',
  },
  featureText: {
    color: '#63756e',
    fontSize: 13,
    lineHeight: 20,
  },
  authCard: {
    backgroundColor: '#fffdf8',
    borderRadius: 30,
    padding: 20,
    gap: 14,
    borderWidth: 1,
    borderColor: '#e6ddcf',
  },
  authCardPhone: {
    borderRadius: 24,
    padding: 18,
  },
  authCardTitle: {
    color: '#17211d',
    fontSize: 24,
    fontWeight: '900',
  },
  authCardText: {
    color: '#657771',
    fontSize: 14,
    lineHeight: 22,
  },
  infoCard: {
    backgroundColor: '#ece3d3',
    borderRadius: 28,
    padding: 18,
    gap: 12,
    borderWidth: 1,
    borderColor: '#d8cab5',
  },
  infoCardTitle: {
    color: '#17211d',
    fontSize: 18,
    fontWeight: '900',
  },
  toggleRow: {
    flexDirection: 'row',
    gap: 10,
  },
  modeChip: {
    flex: 1,
    borderRadius: 999,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: '#f1ebdf',
    borderWidth: 1,
    borderColor: '#ded3c0',
  },
  modeChipActive: {
    backgroundColor: '#163d31',
    borderColor: '#163d31',
  },
  modeChipText: {
    color: '#5d7068',
    fontSize: 13,
    fontWeight: '800',
  },
  modeChipTextActive: {
    color: '#f7fbf9',
  },
  input: {
    backgroundColor: '#f4efe5',
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: '#ddd4c4',
    color: '#17211d',
    fontSize: 14,
  },
  multilineInput: {
    minHeight: 110,
    textAlignVertical: 'top',
  },
  primaryWideButton: {
    backgroundColor: '#153d31',
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 15,
    alignItems: 'center',
  },
  primaryWideButtonText: {
    color: '#f8fbf9',
    fontSize: 14,
    fontWeight: '800',
  },
  error: {
    color: '#b53d34',
    fontSize: 13,
    fontWeight: '700',
  },
  completionHero: {
    borderRadius: 30,
    padding: 24,
    gap: 12,
  },
  completionTitle: {
    color: '#fbfcfb',
    fontSize: 32,
    lineHeight: 38,
    fontWeight: '900',
  },
  completionBody: {
    color: '#caded4',
    fontSize: 14,
    lineHeight: 22,
    maxWidth: 640,
  },
  formCard: {
    backgroundColor: '#f7f4ee',
    borderRadius: 30,
    padding: 20,
    borderWidth: 1,
    borderColor: '#ddd3c4',
    gap: 14,
  },
  heroPanel: {
    borderRadius: 30,
    padding: 22,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  heroPanelPhone: {
    borderRadius: 26,
    padding: 16,
  },
  heroPanelInner: {
    gap: 16,
  },
  heroPanelInnerWide: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  heroPanelCopy: {
    flex: 1,
    gap: 10,
  },
  pageHeroTitle: {
    color: '#fbfcfb',
    fontSize: 30,
    lineHeight: 36,
    fontWeight: '900',
    maxWidth: 680,
  },
  pageHeroTitlePhone: {
    fontSize: 24,
    lineHeight: 30,
  },
  pageHeroBody: {
    color: '#cadfd6',
    fontSize: 14,
    lineHeight: 22,
    maxWidth: 620,
  },
  heroStats: {
    flexDirection: 'row',
    gap: 12,
    flexWrap: 'wrap',
  },
  heroStatsPhone: {
    flexDirection: 'column',
  },
  quickActionRow: {
    flexDirection: 'row',
    gap: 12,
    flexWrap: 'wrap',
  },
  quickActionRowPhone: {
    flexDirection: 'column',
  },
  quickAction: {
    flexGrow: 1,
    minWidth: 180,
    backgroundColor: '#10231d',
    borderRadius: 22,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    gap: 6,
  },
  quickActionPhone: {
    minWidth: 0,
    width: '100%',
    padding: 14,
    flexGrow: 0,
    flexBasis: 'auto',
  },
  quickActionLabel: {
    color: '#9cbcae',
    fontSize: 12,
    fontWeight: '700',
  },
  quickActionValue: {
    color: '#f5fbf8',
    fontSize: 16,
    fontWeight: '800',
  },
  contentColumns: {
    gap: 18,
  },
  contentColumnsWide: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  primaryColumn: {
    flex: 1.2,
    gap: 18,
  },
  primaryColumnPhone: {
    flex: 0,
  },
  secondaryColumn: {
    flex: 0.8,
    gap: 18,
  },
  secondaryColumnPhone: {
    flex: 0,
  },
  memberGrid: {
    gap: 14,
  },
  memberGridTablet: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  memberCard: {
    flexGrow: 1,
    flexBasis: 300,
    backgroundColor: '#fffdf8',
    borderRadius: 24,
    padding: 18,
    borderWidth: 1,
    borderColor: '#e7ddce',
    gap: 10,
  },
  memberCardPhone: {
    flexBasis: '100%',
    padding: 16,
    flexGrow: 0,
    width: '100%',
    alignSelf: 'stretch',
  },
  memberCardCompact: {
    flexBasis: 240,
  },
  mobileMemberCard: {
    backgroundColor: '#fffdf8',
    borderRadius: 24,
    padding: 18,
    borderWidth: 1,
    borderColor: '#e7ddce',
    gap: 12,
  },
  memberBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#eef3ed',
  },
  memberBadgeText: {
    color: '#325445',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.7,
  },
  memberRating: {
    color: '#204d3b',
    fontSize: 13,
    fontWeight: '800',
  },
  memberName: {
    color: '#17211d',
    fontSize: 20,
    fontWeight: '900',
  },
  memberMeta: {
    color: '#61756d',
    fontSize: 13,
    lineHeight: 19,
  },
  memberSkill: {
    color: '#1f4f3d',
    fontSize: 14,
    fontWeight: '800',
  },
  memberBio: {
    color: '#61756d',
    fontSize: 13,
    lineHeight: 20,
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
  },
  rowBetweenPhone: {
    alignItems: 'flex-start',
    flexWrap: 'wrap',
  },
  slotRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  mobileSlotRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  slotRowPhone: {
    flexDirection: 'column',
    alignItems: 'stretch',
  },
  slotChip: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: '#edf1ea',
    borderWidth: 1,
    borderColor: '#dbe2d9',
  },
  mobileSlotChip: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 9,
    backgroundColor: '#edf1ea',
    borderWidth: 1,
    borderColor: '#dbe2d9',
  },
  slotChipActive: {
    backgroundColor: '#163d31',
    borderColor: '#163d31',
  },
  slotChipText: {
    color: '#365246',
    fontSize: 12,
    fontWeight: '700',
  },
  slotChipTextActive: {
    color: '#f6fbf8',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  actionRowPhone: {
    flexDirection: 'column',
    alignItems: 'stretch',
  },
  mobileActionRow: {
    flexDirection: 'row',
    gap: 10,
    flexWrap: 'wrap',
  },
  primaryButton: {
    backgroundColor: '#153d31',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  mobilePrimaryButton: {
    backgroundColor: '#153d31',
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  mobileSecondaryButton: {
    backgroundColor: '#ece6d8',
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#ddd2be',
  },
  mobileOutlineButton: {
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#2d5043',
    backgroundColor: '#fffdf8',
  },
  primaryButtonText: {
    color: '#f7fbf9',
    fontSize: 13,
    fontWeight: '800',
  },
  softButton: {
    backgroundColor: '#ece6d8',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#ddd2be',
  },
  softButtonText: {
    color: '#355047',
    fontSize: 13,
    fontWeight: '800',
  },
  ghostButton: {
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#2d5043',
    backgroundColor: '#f7f4ee',
  },
  ghostButtonText: {
    color: '#2d5043',
    fontSize: 13,
    fontWeight: '800',
  },
  ghostButtonDark: {
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  ghostButtonDarkText: {
    color: '#eff7f2',
    fontSize: 13,
    fontWeight: '800',
  },
  filterRow: {
    flexDirection: 'row',
    gap: 10,
    flexWrap: 'wrap',
  },
  filterChip: {
    borderRadius: 999,
    backgroundColor: '#f0ebdf',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#dfd4bf',
  },
  filterChipActive: {
    backgroundColor: '#163d31',
    borderColor: '#163d31',
  },
  filterChipText: {
    color: '#556861',
    fontSize: 12,
    fontWeight: '800',
  },
  filterChipTextActive: {
    color: '#f7fbf9',
  },
  darkCard: {
    backgroundColor: '#11231d',
    borderRadius: 28,
    padding: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    gap: 12,
  },
  darkCardPhone: {
    borderRadius: 24,
    padding: 16,
  },
  darkCardTitle: {
    color: '#f2faf6',
    fontSize: 18,
    fontWeight: '900',
  },
  darkCardText: {
    color: '#b8d1c6',
    fontSize: 13,
    lineHeight: 21,
  },
  mixBar: {
    flexDirection: 'row',
    height: 12,
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  mixMentor: {
    backgroundColor: '#5aad88',
  },
  mixLearner: {
    backgroundColor: '#d4a562',
  },
  listRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#e7dece',
  },
  listRowTitle: {
    color: '#17211d',
    fontSize: 14,
    fontWeight: '800',
  },
  listRowText: {
    color: '#61756d',
    fontSize: 12,
    lineHeight: 18,
  },
  listRowMeta: {
    color: '#2f5245',
    fontSize: 12,
    fontWeight: '800',
  },
  stackCard: {
    gap: 4,
    paddingVertical: 8,
  },
  stackCardTitle: {
    color: '#17211d',
    fontSize: 14,
    fontWeight: '800',
  },
  stackCardText: {
    color: '#62756e',
    fontSize: 12,
  },
  emptyText: {
    color: '#677972',
    fontSize: 13,
    lineHeight: 20,
  },
  sectionHero: {
    borderRadius: 30,
    padding: 22,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    gap: 10,
  },
  sectionHeroPhone: {
    borderRadius: 24,
    padding: 16,
    gap: 8,
  },
  sectionHeroTitle: {
    color: '#fbfcfb',
    fontSize: 29,
    lineHeight: 35,
    fontWeight: '900',
    maxWidth: 700,
  },
  sectionHeroTitlePhone: {
    fontSize: 22,
    lineHeight: 28,
  },
  sectionHeroText: {
    color: '#cbddd4',
    fontSize: 14,
    lineHeight: 22,
    maxWidth: 640,
  },
  summaryRow: {
    flexDirection: 'row',
    gap: 12,
    flexWrap: 'wrap',
  },
  summaryRowPhone: {
    flexDirection: 'column',
  },
  sessionCard: {
    backgroundColor: '#fffdf8',
    borderRadius: 24,
    padding: 18,
    borderWidth: 1,
    borderColor: '#e6dccd',
    gap: 14,
  },
  sessionCardPhone: {
    padding: 16,
  },
  sessionTitle: {
    color: '#17211d',
    fontSize: 18,
    fontWeight: '900',
  },
  sessionMeta: {
    color: '#61756d',
    fontSize: 13,
    lineHeight: 19,
  },
  sessionStatus: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  sessionStatusUpcoming: {
    backgroundColor: '#507466',
  },
  sessionStatusLive: {
    backgroundColor: '#0f8a5f',
  },
  sessionStatusText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  eventCard: {
    backgroundColor: '#fffdf8',
    borderRadius: 24,
    padding: 18,
    borderWidth: 1,
    borderColor: '#e6dccd',
    gap: 12,
  },
  eventCardPhone: {
    padding: 16,
  },
  eventCopy: {
    flex: 1,
    gap: 4,
  },
  eventTitle: {
    color: '#17211d',
    fontSize: 16,
    fontWeight: '800',
  },
  eventText: {
    color: '#62756e',
    fontSize: 13,
    lineHeight: 20,
  },
  eventMeta: {
    color: '#204d3b',
    fontSize: 18,
    fontWeight: '900',
  },
  notificationItem: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
    paddingVertical: 8,
  },
  notificationDot: {
    width: 10,
    height: 10,
    borderRadius: 999,
    backgroundColor: '#234d3f',
    marginTop: 6,
  },
  notificationBody: {
    flex: 1,
    gap: 4,
  },
  notificationTitle: {
    color: '#17211d',
    fontSize: 14,
    fontWeight: '800',
  },
  notificationText: {
    color: '#62756e',
    fontSize: 12,
    lineHeight: 19,
  },
  threadCard: {
    backgroundColor: '#fffdf8',
    borderRadius: 22,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e6dccd',
    gap: 10,
  },
  threadCardPhone: {
    padding: 14,
  },
  threadName: {
    color: '#17211d',
    fontSize: 15,
    fontWeight: '800',
  },
  threadUnread: {
    color: '#335749',
    fontSize: 12,
    fontWeight: '800',
  },
  threadTopic: {
    color: '#50645d',
    fontSize: 12,
    fontWeight: '700',
  },
  threadText: {
    color: '#62756e',
    fontSize: 13,
    lineHeight: 19,
  },
  roadmapTrack: {
    height: 12,
    borderRadius: 999,
    backgroundColor: '#e8e1d4',
    overflow: 'hidden',
    marginBottom: 8,
  },
  roadmapFill: {
    height: '100%',
    backgroundColor: '#163d31',
  },
  roadmapItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e8dfcf',
  },
  roadmapTitle: {
    color: '#17211d',
    fontSize: 14,
    fontWeight: '700',
  },
  roadmapState: {
    color: '#315445',
    fontSize: 12,
    fontWeight: '900',
  },
  profileHeadline: {
    color: '#214c3a',
    fontSize: 16,
    fontWeight: '800',
  },
  profileSubline: {
    color: '#61756d',
    fontSize: 13,
    lineHeight: 19,
  },
  profileBio: {
    color: '#5f736b',
    fontSize: 14,
    lineHeight: 23,
  },
  tagWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  tag: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 9,
    backgroundColor: '#fff9ee',
    borderWidth: 1,
    borderColor: '#ddd2bf',
  },
  tagText: {
    color: '#3b564c',
    fontSize: 12,
    fontWeight: '700',
  },
  bottomDock: {
    backgroundColor: 'rgba(9, 20, 16, 0.94)',
    borderRadius: 24,
    paddingHorizontal: 8,
    paddingVertical: 8,
    flexDirection: 'row',
    gap: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  bottomDockTablet: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 12,
  },
  bottomDockPhoneInline: {
    marginHorizontal: 14,
    marginTop: 10,
    marginBottom: 10,
    borderRadius: 20,
    paddingHorizontal: 6,
    paddingVertical: 6,
  },
  dockItem: {
    flex: 1,
    borderRadius: 16,
    minHeight: 56,
    paddingVertical: 8,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dockItemPhone: {
    minHeight: 50,
    borderRadius: 14,
    paddingVertical: 6,
  },
  dockItemActive: {
    backgroundColor: '#f1c57d',
  },
  dockText: {
    color: '#edf7f2',
    fontSize: 11,
    fontWeight: '800',
    textAlign: 'center',
  },
  dockTextPhone: {
    fontSize: 10,
    lineHeight: 12,
  },
  dockTextActive: {
    color: '#17211d',
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    padding: 14,
    backgroundColor: 'rgba(6, 11, 9, 0.5)',
  },
  modalCard: {
    backgroundColor: '#f7f4ee',
    borderRadius: 28,
    padding: 20,
    borderWidth: 1,
    borderColor: '#ddd3c4',
    gap: 14,
  },
  pressedScale: {
    transform: [{ scale: 0.985 }],
  },
});
