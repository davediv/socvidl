import { Platform, DetectedVideo } from '../types';

export interface ButtonInjectorOptions {
  platform: Platform;
  iconSvg?: string;
  buttonText?: string;
  className?: string;
  showTextOnMobile?: boolean;
}

export interface InjectedButton {
  id: string;
  element: HTMLButtonElement;
  videoId: string;
  container: HTMLElement;
  platform: Platform;
}

export class ButtonInjector {
  private platform: Platform;
  private iconSvg: string;
  private buttonText: string;
  private className: string;
  private showTextOnMobile: boolean;
  private injectedButtons: Map<string, InjectedButton>;
  private buttonIdPrefix = 'socvidl-btn';
  private clickHandlers: Map<string, (video: DetectedVideo, button: HTMLButtonElement) => void>;

  constructor(options: ButtonInjectorOptions) {
    this.platform = options.platform;
    this.className = options.className || 'socvidl-download-btn';
    this.buttonText = options.buttonText || 'Download';
    this.showTextOnMobile = options.showTextOnMobile || false;
    this.injectedButtons = new Map();
    this.clickHandlers = new Map();

    // Default download icon SVG
    this.iconSvg =
      options.iconSvg ||
      `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
        <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>
      </svg>
    `;
  }

  /**
   * Injects a download button for a detected video
   */
  injectButton(video: DetectedVideo, targetContainer?: HTMLElement): InjectedButton | null {
    // Check if button already exists for this video
    if (this.preventDuplicates(video.id)) {
      console.log(`Button already exists for video ${video.id}`);
      return this.injectedButtons.get(video.id) || null;
    }

    // Determine container
    const container = targetContainer || video.container;
    if (!container) {
      console.warn(`No container found for video ${video.id}`);
      return null;
    }

    // Create button
    const button = this.createButton(video);

    // Position and inject button
    const positioned = this.positionButton(button, container, video);
    if (!positioned) {
      console.warn(`Failed to position button for video ${video.id}`);
      return null;
    }

    // Store button reference
    const injectedButton: InjectedButton = {
      id: button.id,
      element: button,
      videoId: video.id,
      container,
      platform: this.platform,
    };

    this.injectedButtons.set(video.id, injectedButton);

    // Add click handler
    button.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      this.handleButtonClick(video, button);
    });

    return injectedButton;
  }

  /**
   * Creates the button element with appropriate styling
   */
  private createButton(video: DetectedVideo): HTMLButtonElement {
    const button = document.createElement('button');
    button.id = `${this.buttonIdPrefix}-${video.id}`;
    button.className = `${this.className} platform-${this.platform}`;
    button.setAttribute('data-video-id', video.id);
    button.setAttribute('data-tooltip', this.buttonText);
    button.setAttribute('aria-label', `Download video`);

    // Add icon and text
    button.innerHTML = `
      ${this.iconSvg}
      <span>${this.buttonText}</span>
    `;

    // Add mobile class if needed
    if (this.showTextOnMobile) {
      button.classList.add('show-text');
    }

    // Check for dark mode
    if (this.isDarkMode()) {
      button.classList.add('dark-mode');
    }

    return button;
  }

  /**
   * Positions the button within the container based on platform
   */
  positionButton(
    button: HTMLButtonElement,
    container: HTMLElement,
    _video: DetectedVideo
  ): boolean {
    try {
      switch (this.platform) {
        case 'twitter':
        case 'x' as Platform:
          return this.positionTwitterButton(button, container);
        case 'reddit':
          return this.positionRedditButton(button, container);
        default:
          return this.positionGenericButton(button, container);
      }
    } catch (error) {
      console.error('Error positioning button:', error);
      return false;
    }
  }

  /**
   * Positions button for Twitter/X platform
   */
  private positionTwitterButton(button: HTMLButtonElement, container: HTMLElement): boolean {
    // Twitter has action buttons in a role="group" container
    const actionGroup = container.querySelector('[role="group"]');
    if (actionGroup) {
      // Find the last button in the group (usually 'Share')
      const lastButton = Array.from(actionGroup.querySelectorAll('[role="button"]')).pop();
      if (lastButton && lastButton.parentElement) {
        // Insert after the last button's parent container
        lastButton.parentElement.insertAdjacentElement('afterend', button);
        return true;
      }
      // Fallback: append to action group
      actionGroup.appendChild(button);
      return true;
    }

    // Fallback: append to container
    container.appendChild(button);
    return true;
  }

  /**
   * Positions button for Reddit platform
   */
  private positionRedditButton(button: HTMLButtonElement, container: HTMLElement): boolean {
    // Reddit has buttons in various containers depending on the view
    const buttonContainers = [
      '.Post__buttons',
      '[class*="PostFooter"]',
      '[class*="controls"]',
      '._3-miAEojrCvx_4FQ8x3P-s', // Old Reddit
      '._1HL2jtLdJY4dp6E6mTr7kL', // New Reddit
    ];

    for (const selector of buttonContainers) {
      const buttonContainer = container.querySelector(selector);
      if (buttonContainer) {
        // Insert at the end of the button container
        buttonContainer.appendChild(button);
        return true;
      }
    }

    // Fallback: append to container
    container.appendChild(button);
    return true;
  }

  /**
   * Generic button positioning for unknown platforms
   */
  private positionGenericButton(button: HTMLButtonElement, container: HTMLElement): boolean {
    // Try to find a logical place for the button
    const possibleContainers = ['.video-controls', '.media-controls', '.actions', '.toolbar'];

    for (const selector of possibleContainers) {
      const targetContainer = container.querySelector(selector);
      if (targetContainer) {
        targetContainer.appendChild(button);
        return true;
      }
    }

    // Fallback: append to container
    container.appendChild(button);
    return true;
  }

  /**
   * Prevents duplicate buttons for the same video
   */
  preventDuplicates(videoId: string): boolean {
    // Check if button already exists in our map
    if (this.injectedButtons.has(videoId)) {
      const existingButton = this.injectedButtons.get(videoId);
      // Verify the button still exists in DOM
      if (existingButton && document.contains(existingButton.element)) {
        return true;
      }
      // Button was removed from DOM, clean up our reference
      this.injectedButtons.delete(videoId);
    }

    // Check DOM for existing button with same video ID
    const existingButton = document.querySelector(`[data-video-id="${videoId}"]`);
    return !!existingButton;
  }

  /**
   * Handles button click events
   */
  private handleButtonClick(video: DetectedVideo, button: HTMLButtonElement): void {
    const handler = this.clickHandlers.get(video.id);
    if (handler) {
      handler(video, button);
    }
  }

  /**
   * Registers a click handler for a specific video
   */
  onButtonClick(
    videoId: string,
    handler: (video: DetectedVideo, button: HTMLButtonElement) => void
  ): void {
    this.clickHandlers.set(videoId, handler);
  }

  /**
   * Removes a click handler for a specific video
   */
  offButtonClick(videoId: string): void {
    this.clickHandlers.delete(videoId);
  }

  /**
   * Updates button state (loading, success, error)
   */
  updateButtonState(
    videoId: string,
    state: 'idle' | 'loading' | 'success' | 'error',
    text?: string
  ): void {
    const injectedButton = this.injectedButtons.get(videoId);
    if (!injectedButton) return;

    const button = injectedButton.element;

    // Remove all state classes
    button.classList.remove('loading', 'success', 'error');

    // Add new state class
    if (state !== 'idle') {
      button.classList.add(state);
    }

    // Update text if provided
    if (text) {
      const textElement = button.querySelector('span');
      if (textElement) {
        textElement.textContent = text;
      }
    }

    // Reset to idle state after success/error
    if (state === 'success' || state === 'error') {
      setTimeout(() => {
        this.updateButtonState(videoId, 'idle', this.buttonText);
      }, 3000);
    }
  }

  /**
   * Removes an injected button
   */
  removeButton(videoId: string): void {
    const injectedButton = this.injectedButtons.get(videoId);
    if (injectedButton) {
      injectedButton.element.remove();
      this.injectedButtons.delete(videoId);
      this.clickHandlers.delete(videoId);
    }
  }

  /**
   * Removes all injected buttons
   */
  removeAllButtons(): void {
    this.injectedButtons.forEach(button => {
      button.element.remove();
    });
    this.injectedButtons.clear();
    this.clickHandlers.clear();
  }

  /**
   * Gets all injected buttons
   */
  getInjectedButtons(): InjectedButton[] {
    return Array.from(this.injectedButtons.values());
  }

  /**
   * Gets a specific injected button
   */
  getButton(videoId: string): InjectedButton | undefined {
    return this.injectedButtons.get(videoId);
  }

  /**
   * Checks if the current theme is dark mode
   */
  private isDarkMode(): boolean {
    // Check various dark mode indicators
    const darkModeIndicators = [
      document.body.classList.contains('dark'),
      document.body.classList.contains('dark-mode'),
      document.body.classList.contains('theme-dark'),
      document.body.dataset['theme'] === 'dark',
      document.documentElement.dataset['theme'] === 'dark',
      window.matchMedia('(prefers-color-scheme: dark)').matches,
    ];

    return darkModeIndicators.some(indicator => indicator);
  }

  /**
   * Updates all buttons for theme changes
   */
  updateTheme(): void {
    const isDark = this.isDarkMode();
    this.injectedButtons.forEach(button => {
      if (isDark) {
        button.element.classList.add('dark-mode');
      } else {
        button.element.classList.remove('dark-mode');
      }
    });
  }

  /**
   * Sets custom icon for buttons
   */
  setIcon(iconSvg: string): void {
    this.iconSvg = iconSvg;
    // Update existing buttons
    this.injectedButtons.forEach(button => {
      const iconElement = button.element.querySelector('svg');
      if (iconElement && iconElement.parentElement) {
        iconElement.parentElement.innerHTML =
          iconSvg + button.element.querySelector('span')?.outerHTML;
      }
    });
  }

  /**
   * Sets custom text for buttons
   */
  setText(text: string): void {
    this.buttonText = text;
    // Update existing buttons
    this.injectedButtons.forEach(button => {
      const textElement = button.element.querySelector('span');
      if (textElement) {
        textElement.textContent = text;
      }
      button.element.setAttribute('data-tooltip', text);
    });
  }
}
