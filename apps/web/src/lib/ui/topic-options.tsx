import type { Topic } from '../question-bank';
import { groupTopics } from '../topic-tree';

/**
 * Các mục của một ô chọn Chủ đề: chia nhóm theo phần đầu tên, thứ tự tự nhiên. Mục vẫn ghi tên đầy đủ, vì ô đã đóng chỉ
 * hiện tên mục đang chọn.
 */
export function TopicOptions({
  topics,
  text = (topic) => topic.name,
}: {
  topics: Topic[];
  text?: (topic: Topic) => string;
}) {
  const tree = groupTopics(topics);
  const option = (topic: Topic) => (
    <option key={topic.id} value={topic.id}>
      {text(topic)}
    </option>
  );
  return (
    <>
      {tree.groups.map((group) => (
        <optgroup key={group.key} label={group.name}>
          {group.items.map((item) => option(item.topic))}
        </optgroup>
      ))}
      {tree.singles.map(option)}
    </>
  );
}
