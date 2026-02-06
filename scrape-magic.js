const puppeteer = require('puppeteer');
const fs = require('fs');

async function scrapeCinemaMagic() {
    console.log('🎬 Démarrage du scraping du Cinéma Magic Le Creusot...');
    
    const browser = await puppeteer.launch({
        headless: 'new',
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || null,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });
    
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    
    // User agent pour éviter d'être bloqué
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    try {
        console.log('📡 Chargement de la page des horaires...');
        await page.goto('https://www.cinemamagic-creusot.fr/horaires/', {
            waitUntil: 'networkidle2',
            timeout: 60000
        });
        
        console.log('✅ Page chargée');
        
        // Attendre un peu que le JavaScript charge le contenu
        await new Promise(resolve => setTimeout(resolve, 5000));
        console.log('⏳ Attente de 5 secondes pour le chargement JS...');
        
        // Créer le dossier data s'il n'existe pas
        if (!fs.existsSync('data')) {
            fs.mkdirSync('data');
        }
        
        // SAUVEGARDER LE HTML ET SCREENSHOT EN PREMIER (pour debug)
        const html = await page.content();
        fs.writeFileSync('data/page-debug.html', html);
        console.log('📄 HTML sauvegardé dans data/page-debug.html');
        
        await page.screenshot({ path: 'data/screenshot.png', fullPage: true });
        console.log('📸 Screenshot sauvegardé dans data/screenshot.png');
        
        // Lister tous les sélecteurs trouvés pour debug
        const debugInfo = await page.evaluate(() => {
            const info = {
                title: document.title,
                bodyClasses: document.body.className,
                allClasses: [],
                possibleFilmContainers: []
            };
            
            // Trouver toutes les classes uniques
            const allElements = document.querySelectorAll('*[class]');
            const classSet = new Set();
            allElements.forEach(el => {
                el.classList.forEach(c => classSet.add(c));
            });
            info.allClasses = Array.from(classSet).slice(0, 100); // Limiter à 100
            
            // Chercher des conteneurs potentiels de films
            const selectors = [
                '.css-1fwauv0', '.css-kz9mk9',  // Style Capitole
                '[class*="film"]', '[class*="movie"]', '[class*="seance"]',
                '[class*="screening"]', '[class*="show"]',
                'article', '.card', '[class*="card"]'
            ];
            
            selectors.forEach(sel => {
                const els = document.querySelectorAll(sel);
                if (els.length > 0) {
                    info.possibleFilmContainers.push({
                        selector: sel,
                        count: els.length,
                        firstElement: els[0].outerHTML.substring(0, 500)
                    });
                }
            });
            
            return info;
        });
        
        console.log('🔍 Debug info:');
        console.log('   Titre:', debugInfo.title);
        console.log('   Classes trouvées:', debugInfo.allClasses.length);
        console.log('   Conteneurs potentiels:', debugInfo.possibleFilmContainers.length);
        
        debugInfo.possibleFilmContainers.forEach(c => {
            console.log(`   - ${c.selector}: ${c.count} éléments`);
        });
        
        // Sauvegarder les infos de debug
        fs.writeFileSync('data/debug-info.json', JSON.stringify(debugInfo, null, 2));
        console.log('📋 Debug info sauvegardé dans data/debug-info.json');
        
        // Maintenant essayer d'extraire les films
        let films = [];
        
        // Essayer différents sélecteurs
        const filmSelectors = [
            '.css-1fwauv0',           // Style Capitole/WebediaMovies
            '[class*="MovieCard"]',   // Autre style possible
            '[class*="filmCard"]',
            '[class*="movie-card"]',
            '[class*="film-card"]',
            'article[class*="film"]',
            'div[class*="seance"]'
        ];
        
        for (const selector of filmSelectors) {
            const count = await page.$$eval(selector, els => els.length).catch(() => 0);
            if (count > 0) {
                console.log(`✅ Sélecteur trouvé: ${selector} (${count} éléments)`);
                
                // Extraire avec ce sélecteur
                films = await page.evaluate((sel) => {
                    const filmElements = document.querySelectorAll(sel);
                    const filmsData = [];
                    
                    filmElements.forEach((filmEl) => {
                        try {
                            // Essayer plusieurs façons de trouver le titre
                            let titre = '';
                            const titreSelectors = ['h2', 'h3', 'h4', '.title', '[class*="title"]', 'a'];
                            for (const ts of titreSelectors) {
                                const el = filmEl.querySelector(ts);
                                if (el && el.textContent.trim()) {
                                    titre = el.textContent.trim();
                                    break;
                                }
                            }
                            
                            // Affiche
                            const imageEl = filmEl.querySelector('img');
                            const affiche = imageEl ? imageEl.src : '';
                            
                            // Lien
                            const lienEl = filmEl.querySelector('a');
                            let lien = 'https://www.cinemamagic-creusot.fr/horaires/';
                            if (lienEl && lienEl.href) {
                                lien = lienEl.href;
                            }
                            
                            // Horaires - chercher tous les patterns possibles
                            const horaires = [];
                            const timeElements = filmEl.querySelectorAll('time, [class*="time"], [class*="horaire"], button');
                            timeElements.forEach(t => {
                                const text = t.textContent.trim();
                                // Pattern horaire: HH:MM ou HHhMM
                                if (/^\d{1,2}[h:]\d{2}$/.test(text)) {
                                    if (!horaires.includes(text)) {
                                        horaires.push(text);
                                    }
                                }
                            });
                            
                            if (titre && horaires.length > 0) {
                                filmsData.push({
                                    titre: titre,
                                    affiche: affiche,
                                    lien: lien,
                                    duree: '',
                                    genre: '',
                                    horaires: horaires
                                });
                            }
                        } catch (e) {
                            console.error('Erreur extraction:', e);
                        }
                    });
                    
                    return filmsData;
                }, selector);
                
                if (films.length > 0) {
                    console.log(`🎬 ${films.length} films extraits avec ${selector}`);
                    break;
                }
            }
        }
        
        console.log(`🎬 Total: ${films.length} films trouvés`);
        
        films.forEach((film, index) => {
            console.log(`  ${index + 1}. ${film.titre} - Horaires: ${film.horaires.join(', ')}`);
        });
        
        // Créer l'objet de données final
        const data = {
            cinema: {
                nom: "Magic",
                ville: "Le Creusot",
                adresse: "7 rue Hélène Boucher, 71200 Le Creusot",
                url: "https://www.cinemamagic-creusot.fr"
            },
            date: new Date().toISOString().split('T')[0],
            dateUpdate: new Date().toISOString(),
            films: films
        };
        
        // Sauvegarder le JSON
        fs.writeFileSync('data/cinema-magic.json', JSON.stringify(data, null, 2));
        console.log('✅ Données sauvegardées dans data/cinema-magic.json');
        
    } catch (error) {
        console.error('❌ Erreur lors du scraping:', error);
        
        // Même en cas d'erreur, essayer de sauvegarder ce qu'on peut
        try {
            if (!fs.existsSync('data')) {
                fs.mkdirSync('data');
            }
            const html = await page.content();
            fs.writeFileSync('data/page-error.html', html);
            await page.screenshot({ path: 'data/screenshot-error.png', fullPage: true });
            console.log('📸 Screenshot d\'erreur sauvegardé');
        } catch (e) {
            console.error('Impossible de sauvegarder les fichiers de debug:', e);
        }
        
        // Créer un JSON vide pour ne pas casser le site
        const emptyData = {
            cinema: {
                nom: "Magic",
                ville: "Le Creusot",
                adresse: "7 rue Hélène Boucher, 71200 Le Creusot",
                url: "https://www.cinemamagic-creusot.fr"
            },
            date: new Date().toISOString().split('T')[0],
            dateUpdate: new Date().toISOString(),
            films: [],
            error: error.message
        };
        
        if (!fs.existsSync('data')) {
            fs.mkdirSync('data');
        }
        fs.writeFileSync('data/cinema-magic.json', JSON.stringify(emptyData, null, 2));
        
    } finally {
        await browser.close();
        console.log('🔒 Navigateur fermé');
    }
}

scrapeCinemaMagic();