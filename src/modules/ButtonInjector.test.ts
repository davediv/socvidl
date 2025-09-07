import { ButtonInjector } from './ButtonInjector';
import { DetectedVideo, Platform } from '../types';

describe('ButtonInjector', () => {
  let injector: ButtonInjector;
  let mockVideo: DetectedVideo;
  let container: HTMLElement;

  beforeEach(() => {
    // Reset DOM
    document.body.innerHTML = '';
    
    // Create mock container
    container = document.createElement('div');
    container.className = 'video-container';
    document.body.appendChild(container);

    // Create mock video
    mockVideo = {
      id: 'test-video-1',
      element: document.createElement('video') as any,
      url: 'https://example.com/video.mp4',
      platform: 'twitter' as Platform,
      container: container,
      metadata: {
        duration: 120,
        width: 1280,
        height: 720,
        poster: null,
        hasAudio: true,
        isLive: false
      }
    };

    // Create injector instance
    injector = new ButtonInjector({
      platform: 'twitter' as Platform
    });
  });

  afterEach(() => {
    // Clean up
    document.body.innerHTML = '';
  });

  describe('injectButton', () => {
    it('should inject a button into the container', () => {
      const result = injector.injectButton(mockVideo);
      
      expect(result).toBeTruthy();
      expect(result?.element).toBeInstanceOf(HTMLButtonElement);
      expect(container.querySelector('.socvidl-download-btn')).toBeTruthy();
    });

    it('should set correct attributes on the button', () => {
      const result = injector.injectButton(mockVideo);
      const button = result?.element;

      expect(button?.getAttribute('data-video-id')).toBe('test-video-1');
      expect(button?.getAttribute('data-tooltip')).toBe('Download');
      expect(button?.getAttribute('aria-label')).toBe('Download video');
      expect(button?.classList.contains('platform-twitter')).toBe(true);
    });

    it('should include icon and text in button', () => {
      const result = injector.injectButton(mockVideo);
      const button = result?.element;

      expect(button?.querySelector('svg')).toBeTruthy();
      expect(button?.querySelector('span')?.textContent).toBe('Download');
    });

    it('should prevent duplicate buttons for same video', () => {
      const result1 = injector.injectButton(mockVideo);
      const result2 = injector.injectButton(mockVideo);

      expect(result1).toBeTruthy();
      expect(result2).toBe(result1); // Should return same button
      expect(container.querySelectorAll('.socvidl-download-btn').length).toBe(1);
    });

    it('should handle missing container gracefully', () => {
      mockVideo.container = null;
      const result = injector.injectButton(mockVideo);
      
      expect(result).toBeNull();
    });

    it('should use custom target container if provided', () => {
      const customContainer = document.createElement('div');
      document.body.appendChild(customContainer);
      
      const result = injector.injectButton(mockVideo, customContainer);
      
      expect(result).toBeTruthy();
      expect(customContainer.querySelector('.socvidl-download-btn')).toBeTruthy();
      expect(container.querySelector('.socvidl-download-btn')).toBeFalsy();
    });
  });

  describe('positionButton', () => {
    it('should position button in Twitter action group', () => {
      // Create Twitter-like structure
      const actionGroup = document.createElement('div');
      actionGroup.setAttribute('role', 'group');
      
      const existingButton = document.createElement('div');
      existingButton.setAttribute('role', 'button');
      const buttonContainer = document.createElement('div');
      buttonContainer.appendChild(existingButton);
      actionGroup.appendChild(buttonContainer);
      container.appendChild(actionGroup);

      const button = document.createElement('button');
      button.className = 'socvidl-download-btn';
      
      const result = injector.positionButton(button, container, mockVideo);
      
      expect(result).toBe(true);
      expect(actionGroup.contains(button)).toBe(true);
    });

    it('should position button in Reddit controls', () => {
      // Change platform to Reddit
      injector = new ButtonInjector({ platform: 'reddit' as Platform });
      mockVideo.platform = 'reddit' as Platform;

      // Create Reddit-like structure
      const controls = document.createElement('div');
      controls.className = 'Post__buttons';
      container.appendChild(controls);

      const button = document.createElement('button');
      button.className = 'socvidl-download-btn';
      
      const result = injector.positionButton(button, container, mockVideo);
      
      expect(result).toBe(true);
      expect(controls.contains(button)).toBe(true);
    });

    it('should fallback to container if no specific location found', () => {
      const button = document.createElement('button');
      button.className = 'socvidl-download-btn';
      
      const result = injector.positionButton(button, container, mockVideo);
      
      expect(result).toBe(true);
      expect(container.contains(button)).toBe(true);
    });
  });

  describe('preventDuplicates', () => {
    it('should detect existing buttons', () => {
      injector.injectButton(mockVideo);
      
      const isDuplicate = injector.preventDuplicates('test-video-1');
      
      expect(isDuplicate).toBe(true);
    });

    it('should return false for non-existent buttons', () => {
      const isDuplicate = injector.preventDuplicates('non-existent-video');
      
      expect(isDuplicate).toBe(false);
    });

    it('should clean up references to removed buttons', () => {
      const result = injector.injectButton(mockVideo);
      result?.element.remove();
      
      const isDuplicate = injector.preventDuplicates('test-video-1');
      
      expect(isDuplicate).toBe(false);
    });
  });

  describe('updateButtonState', () => {
    it('should update button to loading state', () => {
      const result = injector.injectButton(mockVideo);
      
      injector.updateButtonState('test-video-1', 'loading', 'Processing...');
      
      expect(result?.element.classList.contains('loading')).toBe(true);
      expect(result?.element.querySelector('span')?.textContent).toBe('Processing...');
    });

    it('should update button to success state', () => {
      const result = injector.injectButton(mockVideo);
      
      injector.updateButtonState('test-video-1', 'success', 'Downloaded!');
      
      expect(result?.element.classList.contains('success')).toBe(true);
      expect(result?.element.querySelector('span')?.textContent).toBe('Downloaded!');
    });

    it('should update button to error state', () => {
      const result = injector.injectButton(mockVideo);
      
      injector.updateButtonState('test-video-1', 'error', 'Failed');
      
      expect(result?.element.classList.contains('error')).toBe(true);
      expect(result?.element.querySelector('span')?.textContent).toBe('Failed');
    });

    it('should reset to idle state', () => {
      const result = injector.injectButton(mockVideo);
      
      injector.updateButtonState('test-video-1', 'loading');
      injector.updateButtonState('test-video-1', 'idle');
      
      expect(result?.element.classList.contains('loading')).toBe(false);
      expect(result?.element.classList.contains('success')).toBe(false);
      expect(result?.element.classList.contains('error')).toBe(false);
    });
  });

  describe('removeButton', () => {
    it('should remove a specific button', () => {
      injector.injectButton(mockVideo);
      
      injector.removeButton('test-video-1');
      
      expect(container.querySelector('.socvidl-download-btn')).toBeFalsy();
      expect(injector.getButton('test-video-1')).toBeUndefined();
    });

    it('should handle removing non-existent button', () => {
      expect(() => {
        injector.removeButton('non-existent');
      }).not.toThrow();
    });
  });

  describe('removeAllButtons', () => {
    it('should remove all injected buttons', () => {
      // Inject multiple buttons
      injector.injectButton(mockVideo);
      
      const mockVideo2 = { ...mockVideo, id: 'test-video-2' };
      injector.injectButton(mockVideo2);
      
      injector.removeAllButtons();
      
      expect(document.querySelectorAll('.socvidl-download-btn').length).toBe(0);
      expect(injector.getInjectedButtons().length).toBe(0);
    });
  });

  describe('click handlers', () => {
    it('should register and trigger click handlers', () => {
      const handler = jest.fn();
      
      injector.onButtonClick('test-video-1', handler);
      const result = injector.injectButton(mockVideo);
      
      // Simulate click
      result?.element.click();
      
      expect(handler).toHaveBeenCalledWith(mockVideo, result?.element);
    });

    it('should remove click handlers', () => {
      const handler = jest.fn();
      
      injector.onButtonClick('test-video-1', handler);
      injector.offButtonClick('test-video-1');
      const result = injector.injectButton(mockVideo);
      
      // Simulate click
      result?.element.click();
      
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('theme handling', () => {
    it('should detect dark mode', () => {
      document.body.classList.add('dark');
      
      injector = new ButtonInjector({ platform: 'twitter' as Platform });
      const result = injector.injectButton(mockVideo);
      
      expect(result?.element.classList.contains('dark-mode')).toBe(true);
    });

    it('should update theme for all buttons', () => {
      const result1 = injector.injectButton(mockVideo);
      const mockVideo2 = { ...mockVideo, id: 'test-video-2' };
      const result2 = injector.injectButton(mockVideo2);
      
      document.body.classList.add('dark');
      injector.updateTheme();
      
      expect(result1?.element.classList.contains('dark-mode')).toBe(true);
      expect(result2?.element.classList.contains('dark-mode')).toBe(true);
    });
  });

  describe('customization', () => {
    it('should use custom icon', () => {
      const customIcon = '<svg class="custom-icon"></svg>';
      injector = new ButtonInjector({
        platform: 'twitter' as Platform,
        iconSvg: customIcon
      });
      
      const result = injector.injectButton(mockVideo);
      
      expect(result?.element.querySelector('.custom-icon')).toBeTruthy();
    });

    it('should use custom button text', () => {
      injector = new ButtonInjector({
        platform: 'twitter' as Platform,
        buttonText: 'Save Video'
      });
      
      const result = injector.injectButton(mockVideo);
      
      expect(result?.element.querySelector('span')?.textContent).toBe('Save Video');
    });

    it('should update icon for existing buttons', () => {
      const result = injector.injectButton(mockVideo);
      const newIcon = '<svg class="new-icon"></svg>';
      
      injector.setIcon(newIcon);
      
      expect(result?.element.querySelector('.new-icon')).toBeTruthy();
    });

    it('should update text for existing buttons', () => {
      const result = injector.injectButton(mockVideo);
      
      injector.setText('Save');
      
      expect(result?.element.querySelector('span')?.textContent).toBe('Save');
      expect(result?.element.getAttribute('data-tooltip')).toBe('Save');
    });
  });

  describe('getters', () => {
    it('should get all injected buttons', () => {
      injector.injectButton(mockVideo);
      const mockVideo2 = { ...mockVideo, id: 'test-video-2' };
      injector.injectButton(mockVideo2);
      
      const buttons = injector.getInjectedButtons();
      
      expect(buttons.length).toBe(2);
      expect(buttons[0].videoId).toBe('test-video-1');
      expect(buttons[1].videoId).toBe('test-video-2');
    });

    it('should get specific button', () => {
      injector.injectButton(mockVideo);
      
      const button = injector.getButton('test-video-1');
      
      expect(button?.videoId).toBe('test-video-1');
      expect(button?.platform).toBe('twitter');
    });
  });
});