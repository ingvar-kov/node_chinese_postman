// app.js
let cities = [];
let graph = {
    nodes: [],
    edges: []
};

// Добавление нового поля для города при вводе значения
function addCity() {
    const container = document.getElementById('cities-container');
    const div = document.createElement('div');
    div.className = 'city-input';
    div.innerHTML = `
        <input type="text" placeholder="Название города" class="city-name">
        <button onclick="removeCity(this)">Удалить</button>
    `;
    container.appendChild(div);
}

// Удаление поля города
function removeCity(button) {
    if (document.querySelectorAll('.city-input').length > 1) {
        button.parentElement.remove();
    } else {
        alert('Должен остаться хотя бы один город');
    }
}

// Основная функция расчета маршрута
async function calculateRoute() {
    const cityInputs = document.querySelectorAll('.city-name');
    cities = Array.from(cityInputs).map(input => input.value.trim()).filter(city => city);
    
    if (cities.length < 2) {
        alert('Добавьте как минимум 2 города');
        return;
    }

    try {
        document.getElementById('result').innerHTML = '<p>Загрузка данных...</p>';
        
        // 1. Получаем координаты городов
        const geocodeResponse = await fetch('/api/geocode', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cities })
        });
        
        if (!geocodeResponse.ok) {
            throw new Error('Ошибка геокодирования');
        }
        
        const geocodeData = await geocodeResponse.json();
        
        if (!geocodeData.locations || geocodeData.locations.length !== cities.length) {
            throw new Error('Не удалось определить координаты для всех городов');
        }

        // 2. Получаем матрицу расстояний
        const matrixResponse = await fetch('/api/matrix', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                locations: geocodeData.locations 
            })
        });

        if (!matrixResponse.ok) {
            const errorData = await matrixResponse.json();
            throw new Error(errorData.error || 'Ошибка расчета матрицы расстояний');
        }

        const matrixData = await matrixResponse.json();
        
        // 3. Строим граф
        buildGraph(geocodeData.locations, matrixData.matrix);
        
        // 4. Решаем задачу китайского почтальона
        const route = solveChinesePostman(graph);
        
        // 5. Отображаем результат
        displayResult(route, geocodeData.locations);
        
    } catch (error) {
        console.error('Ошибка:', error);
        document.getElementById('result').innerHTML = `
            <p style="color: red;">Ошибка: ${error.message}</p>
            ${error.details ? `<pre>${JSON.stringify(error.details, null, 2)}</pre>` : ''}
        `;
    }
}

// Построение графа на основе координат и матрицы расстояний
function buildGraph(locations, matrix) {
    const nodes = locations.map((loc, i) => ({
        id: i,
        label: loc.name,
        title: `${loc.name}\n(${loc.latitude.toFixed(4)}, ${loc.longitude.toFixed(4)})`,
        x: loc.longitude,
        y: loc.latitude,
        color: '#4CAF50'
    }));

    const edges = [];
    
    // Создаем ребра только для существующих маршрутов
    for (let i = 0; i < locations.length; i++) {
        for (let j = i + 1; j < locations.length; j++) {
            if (matrix[i][j] !== null && matrix[i][j] > 0) {
                edges.push({
                    from: i,
                    to: j,
                    label: `${Math.round(matrix[i][j])} км`,
                    distance: matrix[i][j] * 1000, // Исправлено: length -> distance
                    value: matrix[i][j],
                    color: '#3A5683',
                    smooth: { type: 'continuous' }
                });
            }
        }
    }

    graph = { nodes, edges };
    visualizeGraph();
}

// Визуализация графа с помощью vis.js
function visualizeGraph() {
    const container = document.getElementById('graph-container');
    
    const data = {
        nodes: new vis.DataSet(graph.nodes.map(node => ({
            ...node,
            font: {
                size: 14,
                face: 'Arial',
                color: '#333',
                strokeWidth: 2,
                strokeColor: '#ffffff'
            },
            shape: 'box',
            margin: 10,
            widthConstraint: {
                minimum: 100,
                maximum: 150
            },
            borderWidth: 2,
            color: {
                border: '#2B7CE9',
                background: '#D2E5FF',
                highlight: {
                    border: '#2B7CE9',
                    background: '#D2E5FF'
                },
                hover: {
                    border: '#2B7CE9',
                    background: '#D2E5FF'
                }
            }
        }))),
        edges: new vis.DataSet(graph.edges.map(edge => ({
            from: edge.from,
            to: edge.to,
            label: edge.label,
            font: {
                size: 12,
                face: 'Arial',
                color: '#333',
                strokeWidth: 2,
                strokeColor: '#ffffff'
            },
            color: {
                color: '#3A5683',
                highlight: '#3A5683',
                hover: '#3A5683'
            },
            width: 2,
            smooth: {
                type: 'continuous'
            }
        })))
    };

    const options = {
        nodes: {
            fixed: false
        },
        edges: {
            arrows: {
                to: false
            }
        },
        physics: {
            enabled: true,
            solver: 'repulsion'
        },
        interaction: {
            hover: false,
            dragNodes: false,
            zoomView: true,
            dragView: false,
            selectable: false
        }
    };

    new vis.Network(container, data, options);
}

/* ---------- УЛУЧШЕННЫЕ АЛГОРИТМЫ ДЛЯ ЗАДАЧИ КИТАЙСКОГО ПОЧТАЛЬОНА ---------- */

// Проверка на эйлеров граф
function checkEulerian(graph) {
    const degrees = {};
    
    // Инициализация степеней для всех вершин
    graph.nodes.forEach(node => {
        degrees[node.id] = 0;
    });
    
    // Подсчет степеней
    graph.edges.forEach(edge => {
        degrees[edge.from]++;
        degrees[edge.to]++;
    });
    
    const oddVertices = Object.keys(degrees)
        .filter(v => degrees[v] % 2 !== 0)
        .map(Number);
    
    return {
        oddVertices,
        isEulerian: oddVertices.length === 0
    };
}


// Алгоритм Дейкстры для поиска кратчайшего пути
function findShortestPath(graph, start, end) {
    const distances = {};
    const previous = {};
    const nodes = new Set();
    
    // Инициализация
    graph.nodes.forEach(node => {
        distances[node.id] = Infinity;
        previous[node.id] = null;
        nodes.add(node.id);
    });
    distances[start] = 0;
    
    while (nodes.size > 0) {
        let current = null;
        for (const node of nodes) {
            if (current === null || distances[node] < distances[current]) {
                current = node;
            }
        }
        
        if (current === end || distances[current] === Infinity) break;
        
        nodes.delete(current);
        
        // Обновляем расстояния до соседей
        const neighbors = graph.edges.filter(
            e => e.from === current || e.to === current
        );
        
        for (const edge of neighbors) {
            const neighbor = edge.from === current ? edge.to : edge.from;
            const alt = distances[current] + edge.distance; // Исправлено: edge.length -> edge.distance
            if (alt < distances[neighbor]) {
                distances[neighbor] = alt;
                previous[neighbor] = { edge, current };
            }
        }
    }
    
    // Восстанавливаем путь
    const path = [];
    let current = end;
    while (previous[current] !== null) {
        path.unshift(previous[current].edge);
        current = previous[current].current;
    }
    
    return path;
}

// Поиск минимального паросочетания (алгоритм жадный)
function findMinWeightMatching(graph, oddVertices) {
    if (oddVertices.length === 0) return [];
    
    // Создаем полный граф между нечетными вершинами
    const edges = [];
    for (let i = 0; i < oddVertices.length; i++) {
        for (let j = i + 1; j < oddVertices.length; j++) {
            const u = oddVertices[i];
            const v = oddVertices[j];
            
            // Ищем кратчайший путь между u и v
            const path = findShortestPath(graph, u, v);
            if (path.length === 0) continue;
            
            const weight = path.reduce((sum, e) => sum + e.distance, 0); // Исправлено: e.length -> e.distance
            edges.push({
                from: u,
                to: v,
                weight,
                path
            });
        }
    }
    
    // Сортируем ребра по весу
    edges.sort((a, b) => a.weight - b.weight);
    
    // Жадный алгоритм паросочетания с улучшенным выбором
    const matching = [];
    const matched = new Set();
    
    // Пробуем найти оптимальное паросочетание
    while (matched.size < oddVertices.length) {
        let bestEdge = null;
        let bestScore = Infinity;
        
        // Ищем ребро с минимальным весом, соединяющее две несопоставленные вершины
        for (const edge of edges) {
            if (!matched.has(edge.from) && !matched.has(edge.to)) {
                if (edge.weight < bestScore) {
                    bestScore = edge.weight;
                    bestEdge = edge;
                }
            }
        }
        
        if (!bestEdge) break; // Не должно происходить для связного графа
        
        matching.push(bestEdge);
        matched.add(bestEdge.from);
        matched.add(bestEdge.to);
    }
    
    return matching;
}

// Алгоритм Флери для нахождения эйлерова цикла (исправленная версия)
function findEulerianCircuit(graph) {
    if (graph.edges.length === 0) return [];

    // Создаем копию ребер для работы
    let edges = [...graph.edges];
    const circuit = []; // Здесь будем хранить ребра в порядке обхода
    const stack = [];
    
    // Начинаем с вершины с максимальной степенью
    let currentVertex = graph.nodes.reduce((maxNode, node) => {
        const degree = edges.filter(e => e.from === node.id || e.to === node.id).length;
        return degree > maxNode.degree ? {id: node.id, degree} : maxNode;
    }, {id: graph.nodes[0].id, degree: 0}).id;

    stack.push(currentVertex);
    
    while (stack.length > 0) {
        currentVertex = stack[stack.length - 1];
        
        // Находим все инцидентные ребра
        const incidentEdges = edges.filter(e => 
            e.from === currentVertex || e.to === currentVertex
        );
        
        if (incidentEdges.length > 0) {
            // Ищем ребро, которое не является мостом (если есть)
            let nextEdge = incidentEdges[0]; // По умолчанию берем первое ребро
            let nextVertex = nextEdge.from === currentVertex ? nextEdge.to : nextEdge.from;
            
            // Удаляем ребро
            edges = edges.filter(e => e !== nextEdge);
            stack.push(nextVertex);
            
            // Запоминаем ребро, по которому прошли
            circuit.push(nextEdge);
        } else {
            // Нет исходящих ребер - возвращаемся
            stack.pop();
        }
    }
    
    return circuit;
}

// Полная реализация алгоритма китайского почтальона (исправленная)
function solveChinesePostman(graph) {
    // Проверяем, что граф не пустой
    if (graph.nodes.length === 0 || graph.edges.length === 0) {
        throw new Error('Граф не содержит вершин или ребер');
    }

    const { isEulerian, oddVertices } = checkEulerian(graph);
    
    // Если граф уже эйлеров - просто возвращаем цикл
    if (isEulerian) {
        return findEulerianCircuit(graph);
    }
    
    // Проверяем количество вершин с нечетной степенью (должно быть четным)
    if (oddVertices.length % 2 !== 0) {
        console.warn("Нечетное количество вершин с нечетной степенью - возможна ошибка в данных");
        oddVertices.pop(); // Удаляем одну вершину для получения четного количества
    }
    
    // 1. Находим минимальное паросочетание нечетных вершин
    const matching = findMinWeightMatching(graph, oddVertices);
    
    // 2. Создаем новый граф с добавленными ребрами
    const augmentedGraph = {
        nodes: graph.nodes,
        edges: [...graph.edges]
    };
    
    // Добавляем ребра из паросочетания (каждое ребро дублируем)
    matching.forEach(match => {
        // Находим оригинальное ребро между этими вершинами
        const originalEdge = graph.edges.find(e => 
            (e.from === match.from && e.to === match.to) || 
            (e.from === match.to && e.to === match.from)
        );
        
        if (originalEdge) {
            augmentedGraph.edges.push({
                ...originalEdge,
                duplicated: true
            });
        } else {
            // Если прямого ребра нет, добавляем путь из нескольких ребер
            match.path.forEach(edge => {
                augmentedGraph.edges.push({
                    ...edge,
                    duplicated: true
                });
            });
        }
    });
    
    // 3. Находим эйлеров цикл в новом графе
    const circuit = findEulerianCircuit(augmentedGraph);
    
    // 4. Строим маршрут с правильной последовательностью
    return buildSequentialRoute(circuit, graph.nodes);
}

function buildSequentialRoute(circuit, nodes) {
    if (circuit.length === 0) return [];

    const route = [];
    let currentCity = circuit[0].from;

    for (const edge of circuit) {
        let nextCity;
        if (edge.from === currentCity) {
            nextCity = edge.to;
        } else if (edge.to === currentCity) {
            nextCity = edge.from;
        } else {
            // Если ребро не связано с текущим городом, пропускаем его
            console.warn('Ребро не связано с текущим городом:', edge);
            continue;
        }

        route.push({
            from: currentCity,
            to: nextCity,
            distance: edge.distance, // Исправлено: edge.length -> edge.distance
            cityFrom: nodes.find(n => n.id === currentCity)?.label,
            cityTo: nodes.find(n => n.id === nextCity)?.label
        });

        currentCity = nextCity;
    }

    return route;
}

// Отображение результата (унифицированное)
function displayResult(route, locations) {
    const resultDiv = document.getElementById('result');
    
    if (!route || route.length === 0) {
        resultDiv.innerHTML = '<p>Не удалось построить маршрут</p>';
        return;
    }
    
    let totalDistance = 0;
    let html = '<h3>Оптимальный маршрут:</h3><ol>';
    
    route.forEach((step) => {
        // Используем названия городов из locations
        const cityFrom = locations[step.from]?.name;
        const cityTo = locations[step.to]?.name;
        const distanceInKm = step.distance / 1000; // Переводим в километры

        if (!cityFrom || !cityTo || isNaN(distanceInKm)) {
            console.error('Некорректный шаг маршрута:', step);
            return;
        }
        
        html += `<li>${cityFrom} → ${cityTo} (${Math.round(distanceInKm)} км)</li>`;
        totalDistance += distanceInKm;
    });
    
    html += `</ol><p><strong>Общая длина маршрута: ${Math.round(totalDistance)} км</strong></p>`;
    
    resultDiv.innerHTML = html;
}
// Инициализация - добавляем первое поле города при загрузке
window.onload = addCity;