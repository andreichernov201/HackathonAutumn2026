export function ViewerError({message, onRetry}: {message: string; onRetry: () => void}) {
  return <div className="dv-error" role="alert"><p>{message}</p><button type="button" onClick={onRetry}>Повторить открытие</button></div>
}
