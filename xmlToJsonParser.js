/*
 *	Music JSON Parsing
 *	
 *	Convert MusicXML which has been converted into JSON into
 *	more manageable and consistent format
 *
 *	Author: Jack Ross
 *	Date: 	February 20, 2016
 *
 */
'use strict';
var fs = require('fs');

function parseFiles(argument) {

	var dirname = 'songs/';

	fs.readdir(dirname, function(err, filenames) {
		if (err) {
			console.log(err);
			return;
		}
		filenames.forEach(function(filename) {
			fs.readFile(dirname + filename, 'utf-8', function(err, content) {
				if (err) {
					console.log(err);
					return;
				}
				console.log('parsing ' + filename);
				var json = JSON.parse(content)
				parseJSON(filename, json);
			});
		});
	});

};

parseFiles();

function parseJSON(fileName, notesJSON) {

	var song = {
		title: '',
		artist: '',
		instrument: '',
		measures: []
	};

	// song unique information
	if (!!notesJSON['movement-title']) {
		song.title = notesJSON['movement-title'];
		console.log('title ' + song.title);
	}

	if (hasProperties(notesJSON, ['identification', 'rights'])) {
		song.artist = notesJSON.identification.rights;
	}
	if (hasProperties(notesJSON, ['part-list', 'time', 'beats'])) {
		song.instrument = notesJSON['part-list']['part-name'];
	}

	// iterate every measure

	var part = notesJSON.part;
	for (var i = 0; i < part.measure.length; i++) {
		var measure = part.measure[i];
		var parsedMeasure = parseMeasure(measure, i);
		song.measures.push(parsedMeasure);
	}

	var jsonString = JSON.stringify(song, null, '\t');

	fs.writeFile("./parsed/" + fileName, jsonString, function(err) {
		if (err) {
			return console.log(err);
		}

		console.log("The file was saved!");
	});
}

var previousBpm = null;

function parseMeasure(measure, index) {

	var parsedMeasure = {
		bpm: previousBpm, // int
		beatsInMeasure: 0,
		timeSignatureNumerator: 4,
		timeSignatureDenominator: 4,
		beats: []
	};

	parsedMeasure.beatsInMeasure = numberOfBeatsInMeasure(measure);

	// check if change in BPM 
	//console.log('index ' + index);
	if (hasProperties(measure, ['direction', 'sound', 'tempo'])) {
		parsedMeasure.bpm = parseInt(measure.direction.sound.tempo);
		previousBpm = parsedMeasure.bpm;
	} else if (index == 0) {
		console.log('ERROR: no BPM for song');
	} else {
		parsedMeasure.bpm = previousBpm;
	}

	// check if change in time signature
	if (hasProperties(measure, ['attributes', 'time', 'beats'])) {
		parsedMeasure.timeSignatureNumerator = parseInt(measure.attributes.time.beats);
	}

	if (hasProperties(measure, ['attributes', 'time', 'beat-type'])) {
		parsedMeasure.timeSignatureDenominator = parseInt(measure.attributes.time['beat-type']);
	}

	// build beat
	parsedMeasure.beats = parseBeats(measure);

	return parsedMeasure;

}

function numberOfBeatsInMeasure(measure) {

	// check if measure is just one note
	if (!Array.isArray(measure.note)) {
		return parseInt(measure.note.duration);
	}

	var beats = 0;

	//console.log(measure);
	for (var i = 0; i < measure.note.length; i++) {
		var note = measure['note'][i];
		if (!note.hasOwnProperty('chord')) {
			var noteDuration = note['duration'];
			beats += parseInt(noteDuration);
		}
	};

	return beats;
}

function sortBeatByLine(beat) {
	
	if (beat.notes.length == 1) {
		return beat;
	}

	// copy object
	notes = beat.notes;
	var notesSorted = JSON.parse(JSON.stringify(notes));

	for (var j = 0; j < notes.length; j++) {
		for (var i = j; i < notes.length; i++) {
			if (notes[i].string < notesSorted[j].string) {
				notesSorted[j] = notes[i];
			}
		}
	}

}

function parseBeats(measure) {

	// check if measure is just one note
	if (!Array.isArray(measure.note)) {

		var beat = {
			isRest: false,
			isChord: false,
			chordName: "",
			isTie: false,
			notes: []
		}

		var note = measure.note;

		// is this a rest
		beat.isRest = note.hasOwnProperty('rest');
		beat.isTie = note.hasOwnProperty('tie');

		var parsedNote;
		if (!beat.isRest) {
			parsedNote = parseNote(note);
		} else {
			parsedNote = createRestNote(note);

		}
		beat.notes.push(parsedNote);
		return beat;
	}

	/*
	 *	Cycle through every note, building beats
	 */

	var beats = [];

	for (var i = 0; i < measure.note.length; i++) {

		var note = measure.note[i];
		if (note.hasOwnProperty('chord')) {

			var beat = beats[beats.length - 1];
			beat.isChord = true;
			var parsedNote = parseNote(note);

			var index;
			for (index = 0; index < beat.notes.length; index++) {
				var string = beat.notes[index].string;
				if (parsedNote.string < string) {
					break;
				}
			} 
			beat.notes.splice(index, 0, parsedNote);

		} else {

			var beat = {
				isRest: false,
				isChord: false,
				chordName: "",
				isTie: false,
				notes: []
			}

			// is this a rest
			beat.isRest = note.hasOwnProperty('rest');
			beat.isTie = note.hasOwnProperty('tie');

			var parsedNote;
			if (!beat.isRest) {
				parsedNote = parseNote(note);
			} else {
				parsedNote = createRestNote(note);

			}
			beat.notes.push(parsedNote);

			beats.push(beat);
		}
	}

	for (var i = 0; i < beats.length; i++) {
		var beat = beats[i];
		beat.chordName = parseChordName(beat);
	}

	return beats;
}

function parseNote(note) {

	var parsedNote = {
		duration: null,
		fret: null,
		string: null,
		pitch: {}
	}

	var notations = note.notations;
	if (notations.hasOwnProperty('technical')) {
		notations = notations.technical;
	} else {
		notations = notations[0];
	}

	parsedNote.string = parseInt(notations['string']);
	parsedNote.fret = parseInt(notations['fret']);
	parsedNote.duration = parseInt(note.duration);

	if (note.hasOwnProperty('pitch')) {
		parsedNote.pitch = note.pitch;

		if (parsedNote.pitch.hasOwnProperty('octave')) {
			parsedNote.pitch.octave = parseInt(parsedNote.pitch.octave);
		}
		if (parsedNote.pitch.hasOwnProperty('alter')) {
			parsedNote.pitch.alter = parseInt(parsedNote.pitch.alter);
		}
	}

	return parsedNote;

}

function createRestNote(note) {

	var parsedNote = {
		duration: null,
		fret: null,
		string: null
	}

	parsedNote.duration = parseInt(note.duration);

	return parsedNote;
}

function hasProperties(obj, props) {
	if (props.length === 0)
		return true;
	if (!obj.hasOwnProperty(props[0]))
		return false;
	return hasProperties(obj[props[0]], props.slice(1));
}

function convertAlphaNoteToNumeric(note) {
	var numericNote = -1;

	if (!note.hasOwnProperty('pitch')) {
		return;
	}
	var pitch = note.pitch.step;

	switch (pitch) {
		case "C":
			numericNote = 0;
			break;
		case "D":
			numericNote = 2;
			break;
		case "E":
			numericNote = 4;
			break;
		case "F":
			numericNote = 5;
			break;
		case "G":
			numericNote = 7;
			break;
		case "A":
			numericNote = 9;
			break;
		case "B":
			numericNote = 11;
			break;
		default:
			numericNote = -1;
			break;
	}

	if (note.pitch.hasOwnProperty('alter')) {
		var alter = note.pitch.alter;

		if (numericNote != -1) {
			numericNote += alter;
			if (numericNote < 0) numericNote = 12 + numericNote;
		}
	}

	return numericNote;
}

// chord name
function parseChordName(beat) {

	var notes = beat.notes;

	if (!notes.isChord && beat.isRest) {
		return "";
	} else if (!notes.isChord) {
		return notes[0].pitch.step;
	}

	var chordBases = [
		"C",
		"C#",
		"D",
		"Eb",
		"E",
		"F",
		"F#",
		"G",
		"G#",
		"A",
		"Bb",
		"B"
	];


	var note1 = 0;
	var note2 = 0;

	var found = false;

	search: {
		for (var k = 0; k < notes.length; k++) {
			note1 = convertAlphaNoteToNumeric(notes[k]);
			for (var j = k + 1; j < notes.length; j++) {
				note2 = convertAlphaNoteToNumeric(notes[j]);
				if ((Math.abs(note2 - note1) == 7) || (Math.abs(note2 - note1) == 5)) {
					found = true;
					break search;
				}
			}
		}
	}

	//console.log("note 1 " + note1 + " note 2 " + note2);


	var baseID;
	var power = false;
	var dom7 = false;
	if (note2 - note1 == 5) {
		baseID = chordBases[note1];
	} else {
		baseID = chordBases[note1 + 5];
	}

	//identifies power chord
	if (notes.Count == 2) {
		return baseID + "power";
	}

	//identifies dom 7 chord
	if (notes.Count == 4) {
		return baseID + "7";
	}

	//stores the 3rd note value in the array
	var note3 = 0; {
		for (var k = 0; k < notes.Count; k++) {
			if ((notes[k] != note1) && (notes[k] != note2)) {
				note3 = notes[k];
			}
		}
	}

	//identifies major chord
	if ((note2 - note3 == 3) || (note2 - note3 == 8) || (note3 - note2 == 4)) {
		return baseID;
	}

	//identifies minor chord
	if ((note2 - note3 == 4) || (note2 - note3 == 9) || (note3 - note2 == 3)) {
		return baseID + "m";
	}

	//identifies suspended 4th chord
	//special case for suspended chords
	if (note3 - note1 == 2) {
		baseID = chordBases[note3];
		return baseID + "sus4";
	}
	if (note3 - note1 == 7) {
		baseID = chordBases[note1];
		return baseID + "sus4";
	}
	if (note3 - note1 == 10) {
		baseID = chordBases[note2];
		return baseID + "sus4";
	} else return "n/a";
}
