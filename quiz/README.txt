quiz/
  db/       — «база»: manifest.json + файлы квизов (*.json)
  viewer/   — прохождение готовых квизов из db/
  builder/  — локальный конструктор; экспорт JSON → положить в db/ и обновить manifest

Запуск HTTP-сервера из корня репозитория programming_lessons:
  python3 -m http.server 8765
