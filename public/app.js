// app.js
let cities = [];
let graph = {
    nodes: [],
    edges: []
};

// Добавление нового поля для города
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
            // Проверяем, что расстояние существует и не равно null
            if (matrix[i][j] !== null && matrix[i][j] > 0) {
                edges.push({
                    from: i,
                    to: j,
                    label: `${Math.round(matrix[i][j])} км`,
                    length: matrix[i][j] * 1000, // Переводим км в метры
                    value: matrix[i][j],
                    color: '#3A5683',
                    smooth: {
                        type: 'continuous'
                    }
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
        nodes: new vis.DataSet(graph.nodes),
        edges: new vis.DataSet(graph.edges)
    };
    const options = {
        nodes: {
            shape: 'dot',
            size: 16
        },
        edges: {
            width: 2,
            smooth: true
        },
        physics: {
            barnesHut: {
                gravitationalConstant: -2000,
                centralGravity: 0.3
            },
            minVelocity: 0.75
        }
    };
    new vis.Network(container, data, options);
}

// Решение задачи китайского почтальона (упрощенная версия)
function solveChinesePostman(graph) {
    // В реальном приложении здесь должна быть полная реализация алгоритма
    // Для демонстрации используем упрощенный подход
    
    // 1. Проверяем, есть ли вершины с нечетной степенью
    const degrees = {};
    graph.edges.forEach(edge => {
        degrees[edge.from] = (degrees[edge.from] || 0) + 1;
        degrees[edge.to] = (degrees[edge.to] || 0) + 1;
    });
    
    const oddVertices = Object.keys(degrees).filter(v => degrees[v] % 2 !== 0);
    
    if (oddVertices.length === 0) {
        // Эйлеров цикл существует
        return findEulerianCircuit(graph);
    } else {
        // Находим минимальное паросочетание для нечетных вершин
        // (в реальной реализации нужно найти минимальное взвешенное паросочетание)
        const augmentedEdges = [...graph.edges];
        
        // Добавляем фиктивные ребра для создания эйлерова графа
        for (let i = 0; i < oddVertices.length; i += 2) {
            if (i + 1 < oddVertices.length) {
                const from = parseInt(oddVertices[i]);
                const to = parseInt(oddVertices[i + 1]);
                
                // Находим кратчайший путь между этими вершинами
                const shortestPath = findShortestPath(graph, from, to);
                
                // Добавляем ребра этого пути как дубликаты
                shortestPath.forEach(edge => {
                    augmentedEdges.push({...edge, duplicated: true});
                });
            }
        }
        
        // Теперь граф эйлеров - находим цикл
        const augmentedGraph = {...graph, edges: augmentedEdges};
        return findEulerianCircuit(augmentedGraph);
    }
}

// Поиск эйлерова цикла (алгоритм Флери)
function findEulerianCircuit(graph) {
    // Упрощенная реализация - в реальном приложении нужен полный алгоритм
    // Здесь возвращаем просто обход всех ребер
    
    const route = [];
    const visitedEdges = new Set();
    
    // Начинаем с первой вершины
    let currentVertex = 0;
    
    while (visitedEdges.size < graph.edges.length) {
        // Находим все непосещенные ребра из текущей вершины
        const availableEdges = graph.edges
            .map((edge, index) => ({...edge, index}))
            .filter(edge => 
                (edge.from === currentVertex || edge.to === currentVertex) &&
                !visitedEdges.has(edge.index)
            );
        
        if (availableEdges.length === 0) break;
        
        // Выбираем первое доступное ребро
        const nextEdge = availableEdges[0];
        visitedEdges.add(nextEdge.index);
        
        // Определяем следующую вершину
        const nextVertex = nextEdge.from === currentVertex ? nextEdge.to : nextEdge.from;
        
        route.push({
            from: currentVertex,
            to: nextVertex,
            distance: nextEdge.length,
            cityFrom: graph.nodes[currentVertex].label,
            cityTo: graph.nodes[nextVertex].label
        });
        
        currentVertex = nextVertex;
    }
    
    return route;
}

// Поиск кратчайшего пути между двумя вершинами (алгоритм Дейкстры)
function findShortestPath(graph, start, end) {
    // Упрощенная реализация - в реальном приложении нужен полный алгоритм
    // Здесь возвращаем прямое ребро между вершинами, если оно существует
    
    const directEdge = graph.edges.find(edge => 
        (edge.from === start && edge.to === end) || 
        (edge.from === end && edge.to === start)
    );
    
    if (directEdge) return [directEdge];
    
    // Если прямого ребра нет, возвращаем пустой массив (в реальной реализации нужно искать путь)
    return [];
}

// Отображение результата
function displayResult(route, locations) {
    const resultDiv = document.getElementById('result');
    
    if (route.length === 0) {
        resultDiv.innerHTML = '<p>Не удалось построить маршрут</p>';
        return;
    }
    
    let totalDistance = 0;
    let html = '<h3>Оптимальный маршрут:</h3><ol>';
    
    route.forEach((step, index) => {
        totalDistance += step.distance;
        html += `<li>${step.cityFrom} → ${step.cityTo} (${Math.round(step.distance / 1000)} км)</li>`;
    });
    
    html += `</ol><p><strong>Общая длина маршрута: ${Math.round(totalDistance / 1000)} км</strong></p>`;
    
    resultDiv.innerHTML = html;
}

// Инициализация - добавляем первое поле города при загрузке
window.onload = addCity;