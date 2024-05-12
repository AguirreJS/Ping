// Importar el módulo Express
const express = require('express');
const app = express();
const fs = require('fs');
const path = require('path');
app.use(express.json());
const util = require('util');
const ping = require('ping');
const { exec } = require('child_process');
const nodemailer = require('nodemailer');


 var TIEMPOPINGS = 5000;
 var TIEMPOPINGSanterior; 
 let intervalId;
// Variable para controlar si el protocolo de alerta se ha ejecutado
let protocoloEjecutado = false;

// Definir el puerto
const PORT = 3000;

const suscripcionesFile = 'Suscripciones.txt';

// Iniciar el servidor
const server = app.listen(PORT, () => {
    console.log(`Servidor iniciado en http://localhost:${PORT}`);
});

// Ruta para agregar una nueva IP
app.post('/NuevaIP', (req, res) => {
    const { nombre, ip, prioridad } = req.body;
    almacenarNombreIP(nombre, ip, prioridad);
    res.send({ message: 'IP agregada correctamente' });
});
function almacenarNombreIP(nombre, ip, prioridad, estado = 0) {
    const data = { nombre, ip, prioridad, estado };

    const filePath = path.join(__dirname, 'datos.txt');

    // Leer el archivo para obtener los datos existentes
    fs.readFile(filePath, 'utf8', (err, fileData) => {
        if (err && err.code !== 'ENOENT') {
            console.error('Error al leer el archivo:', err);
            return;
        }

        let dataArray = [];
        if (fileData) {
            try {
                // Analizar el contenido JSON existente en el archivo
                dataArray = JSON.parse(fileData);
                if (!Array.isArray(dataArray)) {
                    throw new Error('El contenido del archivo no es un array JSON.');
                }
            } catch (parseError) {
                console.error('Error al parsear JSON:', parseError);
                return;
            }
        }

        // Agregar el nuevo dato al array
        dataArray.push(data);

        // Convertir el array de datos a formato JSON
        const jsonData = JSON.stringify(dataArray, null, 2); // null y 2 para formateo legible

        // Escribir el archivo actualizado
        fs.writeFile(filePath, jsonData, (writeErr) => {
            if (writeErr) {
                console.error('Error al escribir en el archivo:', writeErr);
            } else {
                console.log('Datos almacenados correctamente en el archivo:', filePath);
            }
        });
    });
}





// Ruta para obtener las IPs solicitadas
app.post('/ipsolicitadas', (req, res) => {
    fs.readFile('datos.txt', 'utf8', (err, data) => {
        if (err) {
            console.error("Error al leer el archivo:", err);
            return res.status(500).send('Error interno del servidor');
        }

        let objects;
        try {
            // Intentar analizar el contenido completo del archivo como JSON
            objects = JSON.parse(data);
        } catch (parseError) {
            
        }

        // Verificar que lo que se analizó es un array
        if (!Array.isArray(objects)) {
            console.error("El contenido del archivo no es un array JSON.");
            return res.status(500).send('Error interno del servidor');
        }

        res.json(objects);
    });
});


// Ruta para realizar el ping en todas las IPs

app.post('/pingall', async (req, res) => {

    console.log("Ejecutando")
    
});


/////////////////////

function actualizarEstado() {
    fs.readFile('datos.txt', 'utf8', (err, data) => {
        if (err) {
            console.error('Error al leer el archivo datos.txt:', err);
            return;
        }

        const registros = JSON.parse(data);
        let completedPings = 0;

        registros.forEach((registro, index) => {
            ping.sys.probe(registro.ip, (isAlive) => {
                console.log(registro.ip + isAlive);

                // Verificar si el ping ha fallado y la IP tiene prioridad "alta"
                if (!isAlive && registro.prioridad === "alta"  && !protocoloEjecutado) {
                    protocoloDeAlerta(registro.ip);
                    protocoloEjecutado = true;
                }

                if (!isAlive && registro.prioridad === "media"  && !protocoloEjecutado) {
                    protocoloDeAlerta(registro.ip);
                    protocoloEjecutado = true;
                }

                // Si la IP no responde al ping y tiene prioridad baja, establecer el estado a 0
                else if (!isAlive && registro.prioridad === "baja") {
                    registro.estado = 0;
                }
                // Actualizar el estado solo si la IP responde al ping
                if (isAlive) {
                    registro.estado = 1;
                }

                completedPings++;

                // Si todas las comprobaciones de ping se han completado, guardar los datos actualizados
                if (completedPings === registros.length) {
                    fs.writeFile('datos.txt', JSON.stringify(registros, null, 2), 'utf8', (err) => {
                        if (err) {
                            console.error('Error al escribir en el archivo datos.txt:', err);
                            return;
                        }
                        console.log('Datos actualizados correctamente');
                    });
                }
            });
        });
    });
}


function protocoloDeAlerta(ip) {
    TIEMPOPINGSanterior = TIEMPOPINGS;

    console.log(TIEMPOPINGSanterior)

    TIEMPOPINGS = 60000;

    iniciarIntervalo(); 

    // Aquí puedes implementar el código para tu protocolo de alerta
    console.log(`Alerta: La IP ${ip} ha fallado el ping y tiene prioridad alta. Ejecutar protocolo de alerta.`);

    let contadorPingsExitosos = 0;
    let pingsFallidos = 0; // Nuevo contador para rastrear pings fallidos

    // Elimina la declaración de intervalId aquí
    // const intervalId = setInterval(() => {

    intervalId = setInterval(() => { // Modifica aquí para usar la variable global
        ping.sys.probe(ip, (isAlive) => {
            console.log(`Ping a ${ip} - Estado: ${isAlive ? 'activo' : 'inactivo'}`);

            if (isAlive) {
                console.log("regreso");
                TIEMPOPINGS = TIEMPOPINGSanterior ;
                protocoloEjecutado = false;

                iniciarIntervalo(); 

                return;
              
            } else {
                // Incrementar el contador si el ping falla
                pingsFallidos++;
            }

            if (contadorPingsExitosos === 10) {
                // Si ninguno de los 10 pings fue exitoso, cambiar el estado de la IP
                clearInterval(intervalId);
            } else if (pingsFallidos === 10) {
                // Si ninguno de los 10 pings tuvo éxito, cambiar el estado de la IP a inactivo en el archivo datos.txt
                console.log(`Ninguno de los 10 pings a ${ip} fue exitoso. Cambiando estado de la IP a inactivo.`);
                EnvioMail(ip)
                fs.readFile('datos.txt', 'utf8', (err, data) => {
                    if (err) {
                        console.error('Error al leer el archivo datos.txt:', err);
                        return;
                    }

                    let registros = [];
                    if (data) {
                        try {
                            registros = JSON.parse(data);
                        } catch (parseError) {
                            console.error('Error al analizar el contenido JSON:', parseError);
                            return;
                        }
                    }

                    const index = registros.findIndex(registro => registro.ip === ip);
                    if (index !== -1) {
                        registros[index].estado = 0; // Cambiar el estado de la IP a 0 (inactivo)
                        console.log(`Estado de la IP ${ip} cambiado a inactivo`);
                        // Guardar los datos actualizados en el archivo
                        fs.writeFile('datos.txt', JSON.stringify(registros, null, 2), 'utf8', (err) => {
                            if (err) {
                                console.error('Error al escribir en el archivo datos.txt:', err);
                                return;
                            }
                            console.log('Datos actualizados correctamente en el archivo datos.txt');
                            TIEMPOPINGS = TIEMPOPINGSanterior ;
                            setTimeout(() => {
                                protocoloEjecutado = false;
                                console.log("protocoloEjecutado ahora es", protocoloEjecutado);
                              }, 5 * 60 * 1000); // 5 minutos en milisegundos
                            iniciarIntervalo(); 
                        });
                    }
                });
                clearInterval(intervalId);
            }
        });
    }, 1000);
}


// Función para iniciar el intervalo
function iniciarIntervalo() {
    clearInterval(intervalId); // Detener el intervalo anterior (si existe)
    console.log("Tiempo anteior" + TIEMPOPINGSanterior)
    intervalId = setInterval(actualizarEstado, TIEMPOPINGS); // Establecer nuevo intervalo
}

// Manejar la solicitud POST a la ruta '/api/enviarIntervalo'
app.post('/api/enviarIntervalo', (req, res) => {
    const { intervalo } = req.body;
    console.log(`Intervalo recibido en milisegundos: ${intervalo}`);
    TIEMPOPINGS = intervalo;
    iniciarIntervalo(); // Vuelve a iniciar el intervalo con el nuevo valor
    res.status(200).send('Intervalo recibido correctamente.');
});

// Iniciar el intervalo por primera vez
iniciarIntervalo();




// Manejar la solicitud POST a la ruta '/api/enviarIntervalo'
app.post('/api/enviarIntervalo', (req, res) => {
    const { intervalo } = req.body;
    console.log(`Intervalo recibido en milisegundos: ${intervalo}`);
    TIEMPOPINGS = intervalo;
    console.log(TIEMPOPINGS)
    // Aquí puedes hacer lo que quieras con el intervalo recibido
    // Por ahora, simplemente lo imprimimos en la consola
    res.status(200).send('Intervalo recibido correctamente.');
  });

 


// Función para enviar el correo electrónico y eliminar el archivo temporal





let EnvioMailProtocolo = true; // Variable global

function EnvioMail(ip) {
    // Lee el archivo datos.txt
    fs.readFile('datos.txt', 'utf8', (err, data) => {
        if (err) {
            console.error('Error al leer el archivo:', err);
            return;
        }
        
        try {
            // Analiza el contenido como un objeto JSON
            const datos = JSON.parse(data);
            
            // Busca la entrada con la dirección IP proporcionada
            const equipo = datos.find(equipo => equipo.ip === ip);
            
            if (equipo) {
                // Si se encuentra la entrada, imprime el nombre y la prioridad
                console.log(`Nombre: ${equipo.nombre}, Prioridad: ${equipo.prioridad}`);
                
                // Si el protocolo de envío de correo está activo, enviar correo electrónico de alerta
                if (EnvioMailProtocolo) {
                    enviarCorreo(equipo);
                }
            } else {
                console.log('No se encontró ninguna entrada para la IP proporcionada.');
            }
        } catch (error) {
            console.error('Error al analizar el archivo JSON:', error);
        }
    });
}

function enviarCorreo(equipo) {
    // Lee la lista de destinatarios desde el archivo Suscripciones.txt
    fs.readFile('Suscripciones.txt', 'utf8', (err, data) => {
        if (err) {
            console.error('Error al leer el archivo de suscripciones:', err);
            return;
        }

        try {
            // Analiza el contenido como un array de direcciones de correo electrónico
            const destinatarios = JSON.parse(data);

            // Configura el transporte de nodemailer
            const transporter = nodemailer.createTransport({
                service: 'Gmail',
                auth: {
                    user: 'xxxxxxxxxxxxxx@gxxxxxx.xxx',
                    pass: 'xxxxxxxxxxxxxxxxx'
                }
            });

            // Define las opciones de correo electrónico
            const mailOptions = {
                from: 'xxxxxxxxxxxxxl@xxxx.com',
                to: '', // Se actualizará dentro del bucle
                subject: 'SISTEMA ALERTA DENTAL - UN SERVIDOR NO RESPONDE',
                text: `El servidor ${equipo.nombre} con IP ${equipo.ip} de prioridad ${equipo.prioridad} no está respondiendo correctamente.`
            };

            // Envía el correo electrónico a cada destinatario con un pequeño retraso
            destinatarios.forEach((destinatario, index) => {
                setTimeout(() => {
                    mailOptions.to = destinatario;
                    transporter.sendMail(mailOptions, (error, info) => {
                        if (error) {
                            console.error(`Error al enviar el correo electrónico a ${destinatario}:`, error);
                        } else {
                            console.log(`Correo electrónico enviado a ${destinatario}:`, info.response);
                        }
                    });
                }, index * 1000); // Un segundo de diferencia entre cada envío
            });

            EnvioMailProtocolo = false;

            // Después de enviar todos los correos electrónicos, cambia el valor de la variable global
            setTimeout(() => {
                EnvioMailProtocolo = true;
                console.log('Protocolo de envío de correos electrónicos desactivado.');
            }, 7200000); // Se ejecuta después del último envío de correo electrónico
        } catch (error) {
            console.error('Error al analizar el archivo de suscripciones:', error);
        }
    });
}



app.post('/suscrip', (req, res) => {
    const { correo } = req.body;

    // Validar que se haya proporcionado un correo electrónico
    if (!correo) {
        return res.status(400).json({ error: 'Correo electrónico requerido' });
    }

    // Leer el archivo de suscripciones si existe
    let suscripciones = [];
    if (fs.existsSync(suscripcionesFile)) {
        suscripciones = JSON.parse(fs.readFileSync(suscripcionesFile, 'utf8'));
    }

    // Agregar el correo electrónico al array de suscripciones
    suscripciones.push(correo);

    // Guardar el array de suscripciones en el archivo
    fs.writeFileSync(suscripcionesFile, JSON.stringify(suscripciones));

    // Procesar el correo electrónico (en este caso, simplemente imprimirlo)
    console.log('Correo electrónico recibido:', correo);

    // Enviar respuesta al cliente
    return res.status(200).json({ message: 'Suscripción exitosa' });
});



app.use(express.static('public'));

// Ruta raíz
app.get('/', (req, res) => {
    res.sendFile('front.html', { root: __dirname });
});
