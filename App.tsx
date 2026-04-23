import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

type Mentor = {
  id: string;
  name: string;
  role: string;
  skill: string;
  country: string;
  rating: number;
  hourlyCredits: number;
};

type Session = {
  id: string;
  title: string;
  mentor: string;
  schedule: string;
};

type Post = {
  id: string;
  author: string;
  title: string;
  body: string;
  likes: number;
};

const mentorsSeed: Mentor[] = [
  {
    id: 'm1',
    name: 'Elena Torres',
    role: 'Product Designer',
    skill: 'UI/UX Masterclass',
    country: 'Spain',
    rating: 4.9,
    hourlyCredits: 5,
  },
  {
    id: 'm2',
    name: 'Arjun Mehta',
    role: 'Software Architect',
    skill: 'System Design',
    country: 'India',
    rating: 4.8,
    hourlyCredits: 4,
  },
  {
    id: 'm3',
    name: 'Sofia Park',
    role: 'Growth Strategist',
    skill: 'Personal Branding',
    country: 'South Korea',
    rating: 5,
    hourlyCredits: 3,
  },
];

const sessionsSeed: Session[] = [
  {
    id: 's1',
    title: 'Build Premium App UI in Figma',
    mentor: 'Elena Torres',
    schedule: 'Today, 18:00',
  },
  {
    id: 's2',
    title: 'Backend Architecture Deep Dive',
    mentor: 'Arjun Mehta',
    schedule: 'Fri, 20:30',
  },
];

const postsSeed: Post[] = [
  {
    id: 'p1',
    author: 'Maya',
    title: 'Weekly challenge: Teach one concept in 5 mins',
    body: 'Share a bite-sized lesson and get real feedback from global peers.',
    likes: 18,
  },
  {
    id: 'p2',
    author: 'Ryo',
    title: 'Looking for React Native mentor swap',
    body: 'I can teach visual storytelling and need guidance on animations.',
    likes: 24,
  },
];

const tabs = ['Discover', 'Teach', 'Learn', 'Community'] as const;
type Tab = (typeof tabs)[number];

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('Discover');
  const [query, setQuery] = useState('');
  const [connectedMentorIds, setConnectedMentorIds] = useState<string[]>([]);
  const [sessions, setSessions] = useState<Session[]>(sessionsSeed);
  const [posts, setPosts] = useState<Post[]>(postsSeed);
  const [publishedTopic, setPublishedTopic] = useState('');
  const [progress, setProgress] = useState({
    profile: true,
    firstSession: false,
    contribution: false,
  });

  const fade = useRef(new Animated.Value(0)).current;
  const slide = useRef(new Animated.Value(24)).current;

  useEffect(() => {
    fade.setValue(0);
    slide.setValue(24);
    Animated.parallel([
      Animated.timing(fade, {
        toValue: 1,
        duration: 480,
        useNativeDriver: true,
      }),
      Animated.spring(slide, {
        toValue: 0,
        useNativeDriver: true,
        speed: 12,
        bounciness: 4,
      }),
    ]).start();
  }, [activeTab, fade, slide]);

  const filteredMentors = useMemo(() => {
    const safeQuery = query.trim().toLowerCase();
    if (!safeQuery) {
      return mentorsSeed;
    }
    return mentorsSeed.filter((mentor) => {
      return (
        mentor.name.toLowerCase().includes(safeQuery) ||
        mentor.skill.toLowerCase().includes(safeQuery) ||
        mentor.role.toLowerCase().includes(safeQuery)
      );
    });
  }, [query]);

  const completedCount = Object.values(progress).filter(Boolean).length;

  const onConnectMentor = (mentorId: string) => {
    setConnectedMentorIds((prev) => {
      if (prev.includes(mentorId)) {
        return prev.filter((id) => id !== mentorId);
      }
      return [...prev, mentorId];
    });
  };

  const onPublishTopic = () => {
    if (!publishedTopic.trim()) {
      return;
    }
    const newTopic = publishedTopic.trim();
    setSessions((prev) => [
      {
        id: `s-${Date.now()}`,
        title: `${newTopic} Workshop`,
        mentor: 'You',
        schedule: 'Newly published',
      },
      ...prev,
    ]);
    setPosts((prev) => [
      {
        id: `p-${Date.now()}`,
        author: 'You',
        title: `New teaching session: ${newTopic}`,
        body: 'Join my session and let us grow together as a global learning community.',
        likes: 0,
      },
      ...prev,
    ]);
    setProgress((prev) => ({ ...prev, contribution: true }));
    setPublishedTopic('');
  };

  const onBookSession = () => {
    setProgress((prev) => ({ ...prev, firstSession: true }));
    setActiveTab('Learn');
  };

  const onLikePost = (postId: string) => {
    setPosts((prev) =>
      prev.map((post) =>
        post.id === postId ? { ...post, likes: post.likes + 1 } : post
      )
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="light" />
      <View style={styles.backgroundTopGlow} />
      <View style={styles.backgroundBottomGlow} />

      <View style={styles.header}>
        <Text style={styles.brand}>SkillSwap</Text>
        <Text style={styles.subtitle}>
          Learn, teach, and grow with passionate people worldwide
        </Text>
      </View>

      <Animated.View
        style={[
          styles.content,
          { opacity: fade, transform: [{ translateY: slide }] },
        ]}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {activeTab === 'Discover' && (
            <View style={styles.section}>
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Search skills, mentors, or topics..."
                placeholderTextColor="#7A7AA4"
                style={styles.searchInput}
              />

              {filteredMentors.map((mentor) => {
                const isConnected = connectedMentorIds.includes(mentor.id);
                return (
                  <View key={mentor.id} style={styles.premiumCard}>
                    <View style={styles.rowBetween}>
                      <View>
                        <Text style={styles.cardTitle}>{mentor.name}</Text>
                        <Text style={styles.cardMeta}>
                          {mentor.role} · {mentor.country}
                        </Text>
                      </View>
                      <Text style={styles.rating}>★ {mentor.rating}</Text>
                    </View>
                    <Text style={styles.skillBadge}>{mentor.skill}</Text>
                    <View style={styles.rowBetween}>
                      <Text style={styles.creditText}>
                        {mentor.hourlyCredits} credits/hour
                      </Text>
                      <Pressable
                        style={[
                          styles.actionButton,
                          isConnected && styles.actionButtonConnected,
                        ]}
                        onPress={() => onConnectMentor(mentor.id)}
                      >
                        <Text style={styles.actionText}>
                          {isConnected ? 'Connected' : 'Connect'}
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                );
              })}
            </View>
          )}

          {activeTab === 'Teach' && (
            <View style={styles.section}>
              <View style={styles.premiumCard}>
                <Text style={styles.cardTitle}>Publish Your Expertise</Text>
                <Text style={styles.cardMeta}>
                  Host premium sessions and mentor global learners.
                </Text>
                <TextInput
                  value={publishedTopic}
                  onChangeText={setPublishedTopic}
                  placeholder="Example: Motion Design for Apps"
                  placeholderTextColor="#7A7AA4"
                  style={styles.searchInput}
                />
                <Pressable style={styles.wideButton} onPress={onPublishTopic}>
                  <Text style={styles.wideButtonText}>Publish Session</Text>
                </Pressable>
              </View>

              {sessions.map((session) => (
                <View key={session.id} style={styles.premiumCard}>
                  <Text style={styles.cardTitle}>{session.title}</Text>
                  <Text style={styles.cardMeta}>
                    by {session.mentor} · {session.schedule}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {activeTab === 'Learn' && (
            <View style={styles.section}>
              <View style={styles.progressCard}>
                <Text style={styles.cardTitle}>Learning Journey</Text>
                <Text style={styles.cardMeta}>
                  {completedCount}/3 milestones completed
                </Text>
                <View style={styles.progressTrack}>
                  <View
                    style={[
                      styles.progressFill,
                      { width: `${(completedCount / 3) * 100}%` },
                    ]}
                  />
                </View>
              </View>

              <Pressable
                style={styles.checkItem}
                onPress={() =>
                  setProgress((prev) => ({ ...prev, profile: !prev.profile }))
                }
              >
                <Text style={styles.checkEmoji}>{progress.profile ? '✅' : '⬜️'}</Text>
                <Text style={styles.checkText}>Complete profile and interests</Text>
              </Pressable>
              <Pressable style={styles.checkItem} onPress={onBookSession}>
                <Text style={styles.checkEmoji}>
                  {progress.firstSession ? '✅' : '⬜️'}
                </Text>
                <Text style={styles.checkText}>Book your first mentor session</Text>
              </Pressable>
              <Pressable
                style={styles.checkItem}
                onPress={() =>
                  setProgress((prev) => ({
                    ...prev,
                    contribution: !prev.contribution,
                  }))
                }
              >
                <Text style={styles.checkEmoji}>
                  {progress.contribution ? '✅' : '⬜️'}
                </Text>
                <Text style={styles.checkText}>Contribute in the community feed</Text>
              </Pressable>
            </View>
          )}

          {activeTab === 'Community' && (
            <View style={styles.section}>
              {posts.map((post) => (
                <View key={post.id} style={styles.premiumCard}>
                  <Text style={styles.cardMeta}>@{post.author}</Text>
                  <Text style={styles.cardTitle}>{post.title}</Text>
                  <Text style={styles.postBody}>{post.body}</Text>
                  <View style={styles.rowBetween}>
                    <Text style={styles.cardMeta}>{post.likes} likes</Text>
                    <Pressable
                      style={styles.actionButton}
                      onPress={() => onLikePost(post.id)}
                    >
                      <Text style={styles.actionText}>Applaud</Text>
                    </Pressable>
                  </View>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      </Animated.View>

      <View style={styles.tabBar}>
        {tabs.map((tab) => {
          const isActive = activeTab === tab;
          return (
            <Pressable
              key={tab}
              style={[styles.tabItem, isActive && styles.tabItemActive]}
              onPress={() => setActiveTab(tab)}
            >
              <Text style={[styles.tabText, isActive && styles.tabTextActive]}>
                {tab}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#070714',
  },
  backgroundTopGlow: {
    position: 'absolute',
    width: 280,
    height: 280,
    borderRadius: 140,
    top: -120,
    left: -80,
    backgroundColor: '#3535FF',
    opacity: 0.22,
  },
  backgroundBottomGlow: {
    position: 'absolute',
    width: 240,
    height: 240,
    borderRadius: 120,
    bottom: 20,
    right: -70,
    backgroundColor: '#00C6A7',
    opacity: 0.2,
  },
  header: {
    paddingHorizontal: 22,
    paddingTop: 14,
    paddingBottom: 10,
  },
  brand: {
    color: '#FFFFFF',
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  subtitle: {
    color: '#B6B6D0',
    marginTop: 6,
    fontSize: 13,
    lineHeight: 18,
    maxWidth: 310,
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 18,
    paddingBottom: 110,
  },
  section: {
    gap: 12,
  },
  searchInput: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderColor: 'rgba(255,255,255,0.15)',
    borderWidth: 1,
    borderRadius: 16,
    color: '#F8F8FF',
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
  },
  premiumCard: {
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderColor: 'rgba(255,255,255,0.15)',
    borderWidth: 1,
    borderRadius: 20,
    padding: 15,
    gap: 10,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 7,
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
  },
  cardTitle: {
    color: '#F6F7FF',
    fontSize: 16,
    fontWeight: '700',
  },
  cardMeta: {
    color: '#A4A7C4',
    fontSize: 12,
  },
  skillBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(101,110,255,0.25)',
    color: '#DDE0FF',
    fontSize: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  rating: {
    color: '#FFD789',
    fontSize: 13,
    fontWeight: '700',
  },
  creditText: {
    color: '#CCD0E8',
    fontSize: 12,
  },
  actionButton: {
    backgroundColor: '#5F6CFF',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  actionButtonConnected: {
    backgroundColor: '#00A78B',
  },
  actionText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  wideButton: {
    backgroundColor: '#5F6CFF',
    borderRadius: 14,
    alignItems: 'center',
    paddingVertical: 12,
    marginTop: 4,
  },
  wideButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  progressCard: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1,
    borderRadius: 20,
    padding: 15,
    gap: 8,
  },
  progressTrack: {
    height: 9,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.12)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: '#00C6A7',
  },
  checkItem: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 13,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  checkEmoji: {
    fontSize: 16,
  },
  checkText: {
    color: '#EEF0FC',
    fontSize: 13,
    flex: 1,
  },
  postBody: {
    color: '#D3D6EC',
    fontSize: 13,
    lineHeight: 19,
  },
  tabBar: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 18,
    backgroundColor: 'rgba(12,12,26,0.96)',
    borderColor: 'rgba(255,255,255,0.14)',
    borderWidth: 1,
    borderRadius: 20,
    padding: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  tabItem: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 9,
    alignItems: 'center',
  },
  tabItemActive: {
    backgroundColor: '#5F6CFF',
  },
  tabText: {
    color: '#AAB0CF',
    fontSize: 11,
    fontWeight: '600',
  },
  tabTextActive: {
    color: '#FFFFFF',
  },
});
