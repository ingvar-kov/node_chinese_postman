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
                    length: matrix[i][j] * 1000,
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
    graph.edges.forEach(edge => {
        degrees[edge.from] = (degrees[edge.from] || 0) + 1;
        degrees[edge.to] = (degrees[edge.to] || 0) + 1;
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
            const alt = distances[current] + edge.length;
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
            const path = findShortestPath(graph, oddVertices[i], oddVertices[j]);
            const weight = path.reduce((sum, e) => sum + e.length, 0);
            edges.push({
                from: oddVertices[i],
                to: oddVertices[j],
                weight,
                path
            });
        }
    }
    
    // Сортируем ребра по весу
    edges.sort((a, b) => a.weight - b.weight);
    
    // Жадный алгоритм паросочетания
    const matching = [];
    const matched = new Set();
    
    for (const edge of edges) {
        if (!matched.has(edge.from) && !matched.has(edge.to)) {
            matching.push(edge);
            matched.add(edge.from);
            matched.add(edge.to);
            
            if (matched.size === oddVertices.length) break;
        }
    }
    
    return matching;
}

// Алгоритм Флери для нахождения эйлерова цикла
function findEulerianCircuit(graph) {
    // Создаем копию графа для работы
    const edges = [...graph.edges];
    const circuit = [];
    
    // Функция для проверки, является ли ребро мостом
    const isBridge = (u, v) => {
        const index = edges.findIndex(e => 
            (e.from === u && e.to === v) || (e.from === v && e.to === u)
        );
        if (index === -1) return false;
        
        const edge = edges[index];
        edges.splice(index, 1);
        
        // Проверяем связность
        const visited = new Set();
        const stack = [u];
        visited.add(u);
        
        while (stack.length > 0) {
            const current = stack.pop();
            for (const e of edges) {
                if (e.from === current && !visited.has(e.to)) {
                    visited.add(e.to);
                    stack.push(e.to);
                } else if (e.to === current && !visited.has(e.from)) {
                    visited.add(e.from);
                    stack.push(e.from);
                }
            }
        }
        
        // Возвращаем ребро на место
        edges.splice(index, 0, edge);
        
        return !visited.has(v);
    };
    
    // Начинаем с произвольной вершины
    let current = graph.nodes[0]?.id || 0;
    const stack = [current];
    
    while (stack.length > 0) {
        current = stack[stack.length - 1];
        
        // Находим все инцидентные ребра
        const incidentEdges = edges.filter(e => 
            e.from === current || e.to === current
        );
        
        if (incidentEdges.length > 0) {
            // Ищем ребро, которое не мост (если есть)
            let edgeIndex = -1;
            let nextVertex = null;
            
            for (let i = 0; i < incidentEdges.length; i++) {
                const e = incidentEdges[i];
                const v = e.from === current ? e.to : e.from;
                if (!isBridge(current, v)) {
                    edgeIndex = edges.indexOf(e);
                    nextVertex = v;
                    break;
                }
            }
            
            // Если все ребра - мосты, берем первое
            if (edgeIndex === -1) {
                const e = incidentEdges[0];
                edgeIndex = edges.indexOf(e);
                nextVertex = e.from === current ? e.to : e.from;
            }
            
            // Удаляем ребро и переходим к следующей вершине
            edges.splice(edgeIndex, 1);
            stack.push(nextVertex);
        } else {
            // Нет исходящих ребер - добавляем в цепь
            circuit.push(stack.pop());
        }
    }
    
    // Преобразуем вершины в ребра
    const edgeCircuit = [];
    for (let i = 0; i < circuit.length - 1; i++) {
        const from = circuit[i];
        const to = circuit[i + 1];
        const edge = graph.edges.find(e => 
            (e.from === from && e.to === to) || (e.from === to && e.to === from)
        );
        if (edge) edgeCircuit.push(edge);
    }
    
    return edgeCircuit;
}

// Полная реализация алгоритма китайского почтальона
function solveChinesePostman(graph) {
    // Проверяем, является ли граф эйлеровым
    const { isEulerian, oddVertices } = checkEulerian(graph);
    
    if (isEulerian) {
        const circuit = findEulerianCircuit(graph);
        return buildRouteFromCircuit(circuit, graph.nodes);
    } else {
        // 1. Находим минимальное паросочетание нечетных вершин
        const matching = findMinWeightMatching(graph, oddVertices);
        
        // 2. Создаем новый граф с добавленными ребрами
        const augmentedGraph = { 
            nodes: graph.nodes,
            edges: [...graph.edges]
        };
        
        // Добавляем ребра из паросочетания
        matching.forEach(match => {
            match.path.forEach(edge => {
                // Добавляем копию ребра, чтобы не изменять оригинальный граф
                augmentedGraph.edges.push({
                    ...edge,
                    duplicated: true,
                    originalEdgeId: `${Math.min(edge.from, edge.to)}-${Math.max(edge.from, edge.to)}`
                });
            });
        });
        
        // 3. Находим эйлеров цикл в новом графе
        const circuit = findEulerianCircuit(augmentedGraph);
        
        // 4. Строим маршрут, удаляя дубликаты
        return buildRouteFromCircuit(circuit, graph.nodes);
    }
}

// Построение маршрута из эйлерова цикла
function buildRouteFromCircuit(circuit, nodes) {
    if (circuit.length === 0) return [];
    
    const route = [];
    const usedEdges = new Set();
    let currentCity = circuit[0].from; // Начинаем с первого города
    
    for (const edge of circuit) {
        const edgeId = `${Math.min(edge.from, edge.to)}-${Math.max(edge.from, edge.to)}`;
        
        // Пропускаем уже использованные ребра (кроме дублированных)
        if (usedEdges.has(edgeId)) {
            if (!edge.duplicated) continue;
        }
        
        // Добавляем ребро в использованные
        usedEdges.add(edgeId);
        
        // Определяем направление движения
        if (edge.from === currentCity) {
            route.push({
                from: edge.from,
                to: edge.to,
                distance: edge.length,
                cityFrom: nodes.find(n => n.id === edge.from).label,
                cityTo: nodes.find(n => n.id === edge.to).label
            });
            currentCity = edge.to;
        } else if (edge.to === currentCity) {
            route.push({
                from: edge.to,
                to: edge.from,
                distance: edge.length,
                cityFrom: nodes.find(n => n.id === edge.to).label,
                cityTo: nodes.find(n => n.id === edge.from).label
            });
            currentCity = edge.from;
        } else {
            // Если ребро не связано с текущим городом, ищем путь
            const path = findShortestPath(
                { nodes, edges: graph.edges },
                currentCity,
                edge.from
            );
            
            if (path.length > 0) {
                // Добавляем соединяющий путь
                let last = currentCity;
                for (const pathEdge of path) {
                    const next = pathEdge.from === last ? pathEdge.to : pathEdge.from;
                    route.push({
                        from: last,
                        to: next,
                        distance: pathEdge.length,
                        cityFrom: nodes.find(n => n.id === last).label,
                        cityTo: nodes.find(n => n.id === next).label
                    });
                    last = next;
                }
                currentCity = last;
                
                // Теперь добавляем текущее ребро
                if (edge.from === currentCity) {
                    route.push({
                        from: edge.from,
                        to: edge.to,
                        distance: edge.length,
                        cityFrom: nodes.find(n => n.id === edge.from).label,
                        cityTo: nodes.find(n => n.id === edge.to).label
                    });
                    currentCity = edge.to;
                } else {
                    route.push({
                        from: edge.to,
                        to: edge.from,
                        distance: edge.length,
                        cityFrom: nodes.find(n => n.id === edge.to).label,
                        cityTo: nodes.find(n => n.id === edge.from).label
                    });
                    currentCity = edge.from;
                }
            }
        }
    }
    
    return route;
}

// Поиск пути, соединяющего текущий маршрут с новым ребром
function findConnectingPath(route, newEdge, nodes) {
    if (route.length === 0) return null;
    
    const lastCity = route[route.length-1].to;
    const path = [];
    
    // Проверяем, можно ли дойти от последнего города до одного из городов нового ребра
    const citiesToCheck = [newEdge.from, newEdge.to];
    
    for (const city of citiesToCheck) {
        if (city === lastCity) {
            // Если один из городов совпадает с последним в маршруте
            return [{
                from: city,
                to: city === newEdge.from ? newEdge.to : newEdge.from,
                distance: newEdge.length,
                cityFrom: nodes.find(n => n.id === city).label,
                cityTo: nodes.find(n => n.id === (city === newEdge.from ? newEdge.to : newEdge.from)).label
            }];
        }
    }
    
    return null;
}

// Алгоритм Флери для нахождения эйлерова цикла (исправленная версия)
function findEulerianCircuit(graph) {
    // Создаем копию графа для работы
    const edges = [...graph.edges];
    const circuit = [];
    
    // Начинаем с произвольной вершины
    let current = graph.nodes[0]?.id || 0;
    const stack = [current];
    
    while (stack.length > 0) {
        current = stack[stack.length - 1];
        
        // Находим все инцидентные ребра
        const incidentEdges = edges.filter(e => 
            e.from === current || e.to === current
        );
        
        if (incidentEdges.length > 0) {
            // Выбираем ребро, которое не является мостом (если возможно)
            let selectedEdge = null;
            let nextVertex = null;
            
            for (const edge of incidentEdges) {
                const v = edge.from === current ? edge.to : edge.from;
                
                // Проверяем, является ли ребро мостом
                if (!isBridge(edges, current, v)) {
                    selectedEdge = edge;
                    nextVertex = v;
                    break;
                }
            }
            
            // Если все ребра - мосты, берем первое
            if (!selectedEdge) {
                selectedEdge = incidentEdges[0];
                nextVertex = selectedEdge.from === current ? selectedEdge.to : selectedEdge.from;
            }
            
            // Удаляем выбранное ребро
            const edgeIndex = edges.findIndex(e => e === selectedEdge);
            edges.splice(edgeIndex, 1);
            
            // Переходим к следующей вершине
            stack.push(nextVertex);
        } else {
            // Нет исходящих ребер - добавляем в цепь
            circuit.push(stack.pop());
        }
    }
    
    // Преобразуем вершины в ребра
    const edgeCircuit = [];
    for (let i = 0; i < circuit.length - 1; i++) {
        const from = circuit[i];
        const to = circuit[i + 1];
        const edge = graph.edges.find(e => 
            (e.from === from && e.to === to) || (e.from === to && e.to === from)
        );
        if (edge) edgeCircuit.push(edge);
    }
    
    return edgeCircuit;
}

// Проверка, является ли ребро мостом
function isBridge(edges, u, v) {
    const edgeIndex = edges.findIndex(e => 
        (e.from === u && e.to === v) || (e.from === v && e.to === u)
    );
    if (edgeIndex === -1) return false;
    
    const edge = edges[edgeIndex];
    const edgesCopy = edges.filter((_, i) => i !== edgeIndex);
    
    // Проверяем связность без этого ребра
    const visited = new Set();
    const queue = [u];
    visited.add(u);
    
    while (queue.length > 0) {
        const current = queue.shift();
        for (const e of edgesCopy) {
            if (e.from === current && !visited.has(e.to)) {
                visited.add(e.to);
                queue.push(e.to);
            } else if (e.to === current && !visited.has(e.from)) {
                visited.add(e.from);
                queue.push(e.from);
            }
        }
    }
    
    return !visited.has(v);
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
    
    // Удаляем дубликаты маршрута
    const uniqueRoute = [];
    const seenEdges = new Set();
    
    route.forEach(step => {
        const edgeKey = `${step.cityFrom}-${step.cityTo}`;
        const reverseEdgeKey = `${step.cityTo}-${step.cityFrom}`;
        
        if (!seenEdges.has(edgeKey)) {
            uniqueRoute.push(step);
            seenEdges.add(edgeKey);
            seenEdges.add(reverseEdgeKey);
            totalDistance += step.distance;
        }
    });
    
    // Отображаем маршрут
    uniqueRoute.forEach((step, index) => {
        html += `<li>${step.cityFrom} → ${step.cityTo} (${Math.round(step.distance / 1000)} км)</li>`;
    });
    
    html += `</ol><p><strong>Общая длина маршрута: ${Math.round(totalDistance / 1000)} км</strong></p>`;
    
    resultDiv.innerHTML = html;
}

// Инициализация - добавляем первое поле города при загрузке
window.onload = addCity;