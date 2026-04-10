/**
 * AUDIO SERVICE
 *
 * Gestion des effets sonores (SFX) avec Web Audio API
 * Optimisé pour faible latence et performances
 *
 * Meilleures pratiques:
 * - AudioBuffer pour sons courts (< 1 seconde)
 * - Préchargement des sons au démarrage
 * - Un seul AudioContext partagé
 * - Volume contrôlable par l'utilisateur
 * - Nettoyage automatique des sources audio
 *
 * @version 1.1
 * @date 2026-02-05
 */

import { useEffect, useState, useCallback } from 'react';

// Import des fichiers audio (Vite method)
import finishSfxUrl from '@/assets/finish-cards-sfx.wav';
import failSfxUrl from '@/assets/fail-sfx.wav';
import validerSfxUrl from '@/assets/valider-sfx.wav';

interface SoundEffect {
  name: string;
  buffer: AudioBuffer | null;
  loading: boolean;
}

class AudioService {
  private audioContext: AudioContext | null = null;
  private sounds: Map<string, SoundEffect> = new Map();
  private activeSources: Set<AudioBufferSourceNode> = new Set();
  private masterVolume: number = 0.08; // Volume principal
  private enabled: boolean = true;

  // Volume modifiers pour différents SFX
  private readonly volumeModifiers = {
    fail: 0.7,    // -30% pour le bouton rouge (fail)
    valider: 1.0, // volume normal pour le bouton vert
    finish: 1.0,  // volume normal pour la fin
  };

  /**
   * Initialise l'AudioContext et précharge tous les sons
   */
  async initialize(): Promise<void> {
    if (this.audioContext) return;

    try {
      // Créer l'AudioContext (avec compatibilité mobile)
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      this.audioContext = new AudioContextClass();

      // Précharger tous les sons avec les URLs importées
      await Promise.all([
        this.loadSound('finish', finishSfxUrl),
        this.loadSound('fail', failSfxUrl),
        this.loadSound('valider', validerSfxUrl),
      ]);

      console.log('Audio service initialized with', this.sounds.size, 'sounds loaded');
    } catch (error) {
      console.error('Failed to initialize audio service:', error);
    }
  }

  /**
   * Charge un son depuis un fichier et le stocke en AudioBuffer
   */
  private async loadSound(name: string, path: string): Promise<void> {
    if (!this.audioContext) {
      throw new Error('AudioContext not initialized');
    }

    const sound: SoundEffect = { name, buffer: null, loading: true };
    this.sounds.set(name, sound);

    try {
      const response = await fetch(path);
      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);

      sound.buffer = audioBuffer;
      sound.loading = false;
    } catch (error) {
      console.error(`Failed to load sound "${name}":`, error);
      sound.loading = false;
    }
  }

  /**
   * Joue un son préchargé avec volume modifié
   * @param name - Nom du son ('finish', 'fail', 'valider')
   * @param volumeModifier - Modificateur de volume (0.0 à 1.0)
   */
  play(name: string, volumeModifier: number = 1.0): void {
    if (!this.enabled || !this.audioContext) return;

    const sound = this.sounds.get(name);
    if (!sound?.buffer) {
      console.warn(`Sound "${name}" not loaded`);
      return;
    }

    try {
      // Créer une source audio à partir du buffer
      const source = this.audioContext.createBufferSource();
      source.buffer = sound.buffer;

      // Créer un nœud de gain pour le volume avec le modificateur
      const gainNode = this.audioContext.createGain();
      gainNode.gain.value = this.masterVolume * volumeModifier;

      // Connecter la source au gain, puis à la sortie
      source.connect(gainNode);
      gainNode.connect(this.audioContext.destination);

      // Tracker la source pour le nettoyage
      this.activeSources.add(source);

      // Nettoyer la source après la lecture
      source.onended = () => {
        this.activeSources.delete(source);
        try {
          source.disconnect();
        } catch {
          // Source déjà déconnectée, ignorer
        }
      };

      // Démarrer la lecture
      source.start(0);
    } catch (error) {
      console.error(`Failed to play sound "${name}":`, error);
    }
  }

  /**
   * Joue le son de fin de cartes
   */
  playFinish(): void {
    this.play('finish', this.volumeModifiers.finish);
  }

  /**
   * Joue le son d'échec (swipe gauche / bouton rouge)
   */
  playFail(): void {
    this.play('fail', this.volumeModifiers.fail);
  }

  /**
   * Joue le son de validation (swipe droite / bouton vert)
   */
  playValider(): void {
    this.play('valider', this.volumeModifiers.valider);
  }

  /**
   * Définit le volume principal (0.0 à 1.0)
   */
  setVolume(volume: number): void {
    this.masterVolume = Math.max(0, Math.min(1, volume));
  }

  /**
   * Active/désactive les sons
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /**
   * Retourne si les sons sont activés
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Retourne le volume actuel
   */
  getVolume(): number {
    return this.masterVolume;
  }

  /**
   * Resume l'AudioContext (nécessaire sur mobile après interaction utilisateur)
   */
  async resume(): Promise<void> {
    if (this.audioContext?.state === 'suspended') {
      await this.audioContext.resume();
    }
  }

  /**
   * Nettoie toutes les sources audio actives
   */
  private cleanupSources(): void {
    this.activeSources.forEach(source => {
      try {
        source.stop();
        source.disconnect();
      } catch {
        // Source déjà arrêtée/déconnectée, ignorer
      }
    });
    this.activeSources.clear();
  }

  /**
   * Détruit l'AudioContext et nettoie les ressources
   */
  destroy(): void {
    this.cleanupSources();
    if (this.audioContext) {
      try {
        this.audioContext.close();
      } catch {
        // Context déjà fermé, ignorer
      }
      this.audioContext = null;
    }
    this.sounds.clear();
  }
}

// Instance singleton
export const audioService = new AudioService();

/**
 * Hook React pour utiliser le service audio
 *
 * @returns {Object} - Méthodes et état du service audio
 */
export const useAudio = () => {
  const [isInitialized, setIsInitialized] = useState(false);
  const [isEnabled, setIsEnabled] = useState(audioService.isEnabled());
  const [volume, setVolume] = useState(audioService.getVolume());

  useEffect(() => {
    let mounted = true;

    const init = async () => {
      await audioService.initialize();
      if (mounted) {
        setIsInitialized(true);
      }
    };

    init();

    return () => {
      mounted = false;
    };
  }, []);

  const playFinish = useCallback(() => audioService.playFinish(), []);
  const playFail = useCallback(() => audioService.playFail(), []);
  const playValider = useCallback(() => audioService.playValider(), []);

  const handleSetVolume = useCallback((vol: number) => {
    audioService.setVolume(vol);
    setVolume(vol);
  }, []);

  const handleSetEnabled = useCallback((enabled: boolean) => {
    audioService.setEnabled(enabled);
    setIsEnabled(enabled);
  }, []);

  const resume = useCallback(() => audioService.resume(), []);

  return {
    isInitialized,
    isEnabled,
    volume,
    playFinish,
    playFail,
    playValider,
    setVolume: handleSetVolume,
    setEnabled: handleSetEnabled,
    resume,
  };
};
