// server.js
require('dotenv').config();
const express = require('express'); //фреймворк чтобы развернуть сервер - обработка запросов, ответов, роутинг, работа с промежут функциями 
const axios = require('axios'); //JS библ HTTP-запросы API
const cors = require('cors'); //CORS (Cross-Origin Resource Sharing) — разрешает веб-страницам запрашивать ресурсы с других доменов (например, API).
const bodyParser = require('body-parser'); //для автоматической обработки запросов экспрессом, преобраует их в удобный JS код

const app = express(); //запуск экземпляра экспресса
const PORT = process.env.PORT || 3000; //выбор порта из енв или по дефолту

app.use(cors()); //разрешение исп КОРС для всех запросов
app.use(bodyParser.json());
app.use(express.static('public')); //Позволяет серверу на Express автоматически отдавать статические файлы (HTML, CSS, JS, изображения, шрифты и др.) из указанной папки (public в данном случае).

const OPENROUTE_API_KEY = process.env.OPENROUTE_API_KEY;

// Получение координат городов
app.post('/api/geocode', async (req, res) => {
    try {
        const { cities } = req.body; // Получаем массив городов из тела запроса

        // Валидация входных данных
        if (!cities || !Array.isArray(cities)) {
            return res.status(400).json({ error: 'Invalid cities data' });
        }

        const locations = []; // Массив для результатов геокодирования
        
        // Обрабатываем каждый город
        for (const city of cities) {
             // Запрос к API openrouteservice для геокодирования
            const response = await axios.get(
                `https://api.openrouteservice.org/geocode/search?api_key=${OPENROUTE_API_KEY}&text=${encodeURIComponent(city)}`,
                {
                    headers: {
                        'Accept': 'application/json, application/geo+json'
                    }
                }
            );
             // Если город не найден
            if (!response.data.features || response.data.features.length === 0) {
                console.warn(`Город не найден: ${city}`);
                continue;
            }
            
            // Берем первый результат, создаем объекк город с кооррдинатами (наиболее релевантный)
            const feature = response.data.features[0];
            locations.push({
                name: city,
                longitude: feature.geometry.coordinates[0],
                latitude: feature.geometry.coordinates[1],
                confidence: feature.properties.confidence
            });
        }
        
        if (locations.length < 2) {
            return res.status(400).json({ 
                error: 'Недостаточно городов с подтвержденными координатами',
                details: locations
            });
        }
        
        res.json({ locations });
    } catch (error) {
        console.error('Geocoding error:', error.response?.data || error.message);
        res.status(500).json({ 
            error: 'Geocoding failed',
            details: error.response?.data || error.message
        });
    }
});

// Получение матрицы расстояний
app.post('/api/matrix', async (req, res) => {
    try {
        const { locations } = req.body;
        
        const response = await axios.post(`https://api.openrouteservice.org/v2/matrix/driving-car`, {
            locations: locations.map(loc => [loc.longitude, loc.latitude]),
            metrics: ['distance'],
            units: 'km',
            sources: Array.from({ length: locations.length }, (_, i) => i), //указывает между какими точками считать расстояние
            destinations: Array.from({ length: locations.length }, (_, i) => i)
        }, {
            headers: {
                'Authorization': OPENROUTE_API_KEY,
                'Content-Type': 'application/json',
                'Accept': 'application/json, application/geo+json'
            }
        });

        // Проверяем структуру ответа
        if (!response.data.distances) {
            throw new Error('Invalid response structure from ORS API');
        }

        res.json({ 
            matrix: response.data.distances,
            durations: response.data.durations 
        });
    } catch (error) {
        console.error('Matrix error:', error.response?.data || error.message);
        res.status(500).json({ 
            error: 'Matrix calculation failed',
            details: error.response?.data || error.message 
        });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});