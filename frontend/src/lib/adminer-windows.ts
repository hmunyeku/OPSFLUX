/**
 * Adminer windows management
 * Tracks and manages Adminer windows to close them on logout for security
 */

const ADMINER_WINDOWS_KEY = 'adminer_windows'

class AdminerWindowManager {
  private windows: Set<Window> = new Set()

  /**
   * Register a new Adminer window
   */
  addWindow(win: Window): void {
    if (win && !win.closed) {
      this.windows.add(win)

      // Clean up closed windows periodically
      this.cleanupClosedWindows()
    }
  }

  /**
   * Close all Adminer windows
   */
  closeAllWindows(): void {
    this.windows.forEach(win => {
      try {
        if (win && !win.closed) {
          win.close()
        }
      } catch (error) {
        console.warn('Failed to close Adminer window:', error)
      }
    })
    this.windows.clear()
  }

  /**
   * Remove closed windows from tracking
   */
  private cleanupClosedWindows(): void {
    const openWindows = new Set<Window>()
    this.windows.forEach(win => {
      if (win && !win.closed) {
        openWindows.add(win)
      }
    })
    this.windows = openWindows
  }

  /**
   * Get count of open Adminer windows
   */
  getOpenWindowsCount(): number {
    this.cleanupClosedWindows()
    return this.windows.size
  }
}

// Singleton instance
export const adminerWindowManager = new AdminerWindowManager()
