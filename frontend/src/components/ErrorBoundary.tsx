import { Component, ErrorInfo, ReactNode } from 'react';

interface Props { children: ReactNode }
interface State { hasError: boolean; message?: string }

/** Ловит ошибки рендера, чтобы пользователь не видел белый экран. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('UI crash:', error, info);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-bg text-center">
        <div className="card p-6 max-w-sm w-full space-y-4">
          <div className="text-4xl">⚓</div>
          <h2 className="font-display text-main text-lg">Что-то пошло не так</h2>
          <p className="text-muted text-sm leading-relaxed">
            Произошла ошибка интерфейса. Перезагрузите приложение — данные не потеряются.
          </p>
          <button className="btn-primary w-full" onClick={() => window.location.reload()}>
            Перезагрузить
          </button>
        </div>
      </div>
    );
  }
}
