export function ViewerLoading({updating = false}: {updating?: boolean}) {
  return <p className="dv-status" role="status">{updating ? 'Обновление предпросмотра…' : 'Загрузка документа…'}</p>
}
